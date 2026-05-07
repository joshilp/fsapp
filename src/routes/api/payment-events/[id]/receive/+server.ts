/**
 * PATCH /api/payment-events/[id]/receive
 * Marks a pending payment event as received and optionally promotes
 * the associated booking from 'reserved' to 'confirmed'.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { paymentEvents, bookings } from '$lib/server/db/schema';

export const PATCH: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const pe = await db.query.paymentEvents.findFirst({
		where: eq(paymentEvents.id, params.id),
		columns: { id: true, bookingId: true, status: true }
	});
	if (!pe) return json({ error: 'Not found' }, { status: 404 });
	if (pe.status === 'received') return json({ ok: true, alreadyReceived: true });

	const now = new Date();

	// Mark the payment as received
	await db.update(paymentEvents)
		.set({ status: 'received', chargedAt: now })
		.where(eq(paymentEvents.id, params.id));

	// Promote booking from reserved → confirmed if this was the first received payment
	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, pe.bookingId),
		columns: { status: true }
	});
	let promoted = false;
	if (booking?.status === 'reserved') {
		await db.update(bookings)
			.set({ status: 'confirmed' })
			.where(eq(bookings.id, pe.bookingId));
		promoted = true;
	}

	return json({ ok: true, promoted });
};
