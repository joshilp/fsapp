/**
 * POST /api/booking/[id]/cancel
 *
 * Cancels a booking, applies the property's cancellation policy, and
 * records appropriate charge/refund folio lines.
 *
 * Returns:
 * {
 *   daysToCheckin: number,
 *   depositPaidCents: number,
 *   cancellationFeeCents: number,
 *   refundCents: number,         // 0 if within no-refund window
 *   noRefund: boolean,
 *   lineItemsAdded: string[],    // human-readable description of lines added
 * }
 *
 * Body (optional overrides):
 * { confirmRefundCents?: number }  // operator can override refund amount
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	bookings, bookingLineItems, paymentEvents, properties
} from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const id = params.id;
	const body = await request.json().catch(() => ({}));

	// Load booking with property policy and payments
	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, id),
		columns: {
			id: true, status: true, checkInDate: true, checkOutDate: true,
			propertyId: true, roomId: true, cancelledAt: true
		},
		with: {
			lineItems: { columns: { type: true, totalAmount: true } },
			paymentEvents: { columns: { type: true, amount: true } }
		}
	});
	if (!booking) return json({ error: 'Booking not found' }, { status: 404 });
	if (booking.status === 'cancelled') return json({ error: 'Already cancelled' }, { status: 400 });
	if (booking.status === 'checked_out') return json({ error: 'Already checked out — cannot cancel' }, { status: 400 });

	// Load property policy
	const property = await db.query.properties.findFirst({
		where: eq(properties.id, booking.propertyId),
		columns: { cancellationFeeCents: true, noRefundDays: true }
	});
	const policyFee = property?.cancellationFeeCents ?? 2500;
	const noRefundDays = property?.noRefundDays ?? 30;

	// Calculate days until check-in
	const today = new Date();
	today.setHours(12, 0, 0, 0);
	const checkInMs = new Date(booking.checkInDate + 'T12:00:00').getTime();
	const daysToCheckin = Math.round((checkInMs - today.getTime()) / 86400000);

	// How much the guest has paid (deposits + final charges, minus refunds already given)
	const depositPaidCents = booking.paymentEvents
		.filter(p => p.type !== 'refund')
		.reduce((s, p) => s + p.amount, 0);
	const alreadyRefunded = booking.paymentEvents
		.filter(p => p.type === 'refund')
		.reduce((s, p) => s + p.amount, 0);
	const netPaid = depositPaidCents - alreadyRefunded;

	// Policy calculation
	const noRefund = daysToCheckin < noRefundDays && daysToCheckin >= 0;
	const refundCents = body.confirmRefundCents != null
		? Math.max(0, body.confirmRefundCents)        // operator override
		: noRefund
			? 0
			: Math.max(0, netPaid - policyFee);       // refund deposit minus fee

	const now = new Date();
	const lineItemsAdded: string[] = [];

	// Add cancellation fee charge line
	if (policyFee > 0) {
		await db.insert(bookingLineItems).values({
			id: crypto.randomUUID(),
			bookingId: id,
			type: 'extra',
			label: `Cancellation fee${noRefund ? ' (no refund — within ' + noRefundDays + ' days)' : ''}`,
			quantity: null,
			unitAmount: null,
			totalAmount: policyFee,
			sortOrder: 9000
		});
		lineItemsAdded.push(`Cancellation fee: $${(policyFee / 100).toFixed(2)}`);
	}

	// Add refund payment event if applicable
	if (refundCents > 0) {
		await db.insert(paymentEvents).values({
			id: crypto.randomUUID(),
			bookingId: id,
			type: 'refund',
			amount: refundCents,
			paymentMethod: 'cash',       // operator will update if different method
			notes: `Cancellation refund ($${(netPaid / 100).toFixed(2)} paid − $${(policyFee / 100).toFixed(2)} fee)`,
			chargedAt: now
		});
		lineItemsAdded.push(`Refund: $${(refundCents / 100).toFixed(2)}`);
	}

	// Cancel the booking
	await db.update(bookings)
		.set({ status: 'cancelled', cancelledAt: now })
		.where(eq(bookings.id, id));

	// Mark room available (no housekeeping change needed for cancellations)

	return json({
		daysToCheckin,
		depositPaidCents: netPaid,
		cancellationFeeCents: policyFee,
		refundCents,
		noRefund,
		lineItemsAdded
	});
};
