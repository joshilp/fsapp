/**
 * POST /api/groups/[id]/transfer-payment
 *
 * Moves part or all of a payment from one room's booking to another within
 * the same group. Creates two ledger entries:
 *   1. A "refund" on the source booking  (reduces its collected amount)
 *   2. A "deposit" on the target booking (increases its collected amount)
 *
 * Both entries note the transfer for audit trail.
 *
 * Body: {
 *   paymentEventId: string,
 *   fromBookingId:  string,
 *   toBookingId:    string,
 *   amountCents:    number,   // must be ≤ original payment amount
 * }
 */
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, groups, paymentEvents } from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const groupId = params.id;
	const body = await request.json().catch(() => null);
	if (!body) return json({ error: 'Invalid body' }, { status: 400 });

	const { paymentEventId, fromBookingId, toBookingId, amountCents } = body;

	if (!paymentEventId || !fromBookingId || !toBookingId || !amountCents) {
		return json({ error: 'Missing required fields' }, { status: 400 });
	}
	if (typeof amountCents !== 'number' || amountCents <= 0) {
		return json({ error: 'amountCents must be a positive number' }, { status: 400 });
	}
	if (fromBookingId === toBookingId) {
		return json({ error: 'Source and target rooms must be different' }, { status: 400 });
	}

	// Verify group exists
	const group = await db.query.groups.findFirst({
		where: eq(groups.id, groupId),
		columns: { id: true }
	});
	if (!group) return json({ error: 'Group not found' }, { status: 404 });

	// Verify both bookings belong to this group
	const [fromBooking, toBooking] = await Promise.all([
		db.query.bookings.findFirst({
			where: and(eq(bookings.id, fromBookingId), eq(bookings.groupId, groupId)),
			columns: { id: true }
		}),
		db.query.bookings.findFirst({
			where: and(eq(bookings.id, toBookingId), eq(bookings.groupId, groupId)),
			columns: { id: true }
		})
	]);
	if (!fromBooking) return json({ error: 'Source booking not found in this group' }, { status: 404 });
	if (!toBooking)   return json({ error: 'Target booking not found in this group' }, { status: 404 });

	// Verify the source payment event exists on the source booking
	const sourcePayment = await db.query.paymentEvents.findFirst({
		where: and(eq(paymentEvents.id, paymentEventId), eq(paymentEvents.bookingId, fromBookingId)),
		columns: { id: true, amount: true, paymentMethod: true, type: true }
	});
	if (!sourcePayment) return json({ error: 'Payment event not found' }, { status: 404 });
	if (sourcePayment.type === 'refund') {
		return json({ error: 'Cannot transfer a refund entry' }, { status: 400 });
	}
	if (amountCents > sourcePayment.amount) {
		return json({
			error: `Cannot transfer more than the original payment ($${(sourcePayment.amount / 100).toFixed(2)})`
		}, { status: 400 });
	}

	const now = new Date();
	const refundId  = crypto.randomUUID();
	const depositId = crypto.randomUUID();

	// 1. Refund on source booking (reduces what was collected there)
	await db.insert(paymentEvents).values({
		id: refundId,
		bookingId: fromBookingId,
		type: 'refund',
		amount: amountCents,
		paymentMethod: sourcePayment.paymentMethod,
		notes: `Folio transfer → Rm (…${toBookingId.slice(-6)})`,
		chargedAt: now
	});

	// 2. Deposit on target booking (records it as collected there)
	await db.insert(paymentEvents).values({
		id: depositId,
		bookingId: toBookingId,
		type: 'deposit',
		amount: amountCents,
		paymentMethod: sourcePayment.paymentMethod,
		notes: `Folio transfer ← Rm (…${fromBookingId.slice(-6)})`,
		chargedAt: now
	});

	return json({ ok: true, refundId, depositId });
};
