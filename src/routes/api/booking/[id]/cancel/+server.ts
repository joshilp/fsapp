/**
 * GET  /api/booking/[id]/cancel  — preview policy (no changes)
 * POST /api/booking/[id]/cancel  — actually cancel the booking
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, bookingLineItems, paymentEvents, properties } from '$lib/server/db/schema';
import { sendCancellationNotice } from '$lib/server/email';

/** GET — preview cancellation policy without making changes */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		columns: { id: true, status: true, checkInDate: true, propertyId: true },
		with: { paymentEvents: { columns: { type: true, amount: true } } }
	});
	if (!booking) return json({ error: 'Booking not found' }, { status: 404 });

	const property = await db.query.properties.findFirst({
		where: eq(properties.id, booking.propertyId),
		columns: { cancellationFeeCents: true, noRefundDays: true }
	});
	const policyFee = property?.cancellationFeeCents ?? 2500;
	const noRefundDays = property?.noRefundDays ?? 30;

	const today = new Date(); today.setHours(12, 0, 0, 0);
	const daysToCheckin = Math.round(
		(new Date(booking.checkInDate + 'T12:00:00').getTime() - today.getTime()) / 86400000
	);
	const netPaid = booking.paymentEvents.reduce(
		(s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0
	);
	const noRefund = daysToCheckin < noRefundDays && daysToCheckin >= 0;
	const refundCents = noRefund ? 0 : Math.max(0, netPaid - policyFee);

	return json({ daysToCheckin, depositPaidCents: netPaid, cancellationFeeCents: policyFee, refundCents, noRefund, noRefundDays });
};

/** POST — cancel the booking and record folio lines */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const id = params.id;
	const body = await request.json().catch(() => ({}));

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

	const property = await db.query.properties.findFirst({
		where: eq(properties.id, booking.propertyId),
		columns: { cancellationFeeCents: true, noRefundDays: true }
	});
	const policyFee = property?.cancellationFeeCents ?? 2500;
	const noRefundDays = property?.noRefundDays ?? 30;

	const today = new Date(); today.setHours(12, 0, 0, 0);
	const daysToCheckin = Math.round(
		(new Date(booking.checkInDate + 'T12:00:00').getTime() - today.getTime()) / 86400000
	);

	const depositPaidCents = booking.paymentEvents
		.filter(p => p.type !== 'refund')
		.reduce((s, p) => s + p.amount, 0);
	const alreadyRefunded = booking.paymentEvents
		.filter(p => p.type === 'refund')
		.reduce((s, p) => s + p.amount, 0);
	const netPaid = depositPaidCents - alreadyRefunded;

	const noRefund = daysToCheckin < noRefundDays && daysToCheckin >= 0;
	const refundCents = body.confirmRefundCents != null
		? Math.max(0, body.confirmRefundCents)
		: noRefund
			? 0
			: Math.max(0, netPaid - policyFee);

	const now = new Date();
	const lineItemsAdded: string[] = [];

	if (policyFee > 0) {
		await db.insert(bookingLineItems).values({
			id: crypto.randomUUID(),
			bookingId: id,
			type: 'extra',
			label: `Cancellation fee${noRefund ? ' (no refund — within no-refund window)' : ''}`,
			quantity: null,
			unitAmount: null,
			totalAmount: policyFee,
			sortOrder: 9000
		});
		lineItemsAdded.push(`Cancellation fee: $${(policyFee / 100).toFixed(2)}`);
	}

	if (refundCents > 0) {
		await db.insert(paymentEvents).values({
			id: crypto.randomUUID(),
			bookingId: id,
			type: 'refund',
			amount: refundCents,
			paymentMethod: 'cash',
			notes: `Cancellation refund ($${(netPaid / 100).toFixed(2)} paid − $${(policyFee / 100).toFixed(2)} fee)`,
			chargedAt: now
		});
		lineItemsAdded.push(`Refund: $${(refundCents / 100).toFixed(2)}`);
	}

	await db.update(bookings)
		.set({ status: 'cancelled', cancelledAt: now })
		.where(eq(bookings.id, id));

	// Send cancellation email to guest (non-blocking)
	const fullBooking = await db.query.bookings.findFirst({
		where: eq(bookings.id, id),
		columns: { checkInDate: true, checkOutDate: true },
		with: {
			guest: { columns: { name: true, email: true } },
			property: { columns: { name: true } }
		}
	});
	if (fullBooking?.guest?.email) {
		void sendCancellationNotice({
			guestName: fullBooking.guest.name ?? 'Guest',
			guestEmail: fullBooking.guest.email,
			propertyName: fullBooking.property?.name ?? '',
			checkInDate: fullBooking.checkInDate,
			checkOutDate: fullBooking.checkOutDate,
			refundCents,
			cancellationFeeCents: policyFee
		});
	}

	return json({ daysToCheckin, depositPaidCents: netPaid, cancellationFeeCents: policyFee, refundCents, noRefund, lineItemsAdded });
};
