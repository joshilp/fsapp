/**
 * POST /api/booking/[id]/confirm
 * Promotes a booking from 'reserved' (Pending) to 'confirmed'.
 * Also handles undo: 'confirmed' → 'reserved' if the query param ?undo=1 is set.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const undo = body?.undo === true;

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		columns: { id: true, status: true }
	});
	if (!booking) return json({ error: 'Not found' }, { status: 404 });

	let newStatus: string;
	if (undo) {
		if (booking.status !== 'confirmed') return json({ error: 'Booking is not confirmed' }, { status: 400 });
		newStatus = 'reserved';
	} else {
		if (booking.status !== 'reserved') return json({ error: 'Booking is not pending' }, { status: 400 });
		newStatus = 'confirmed';
	}

	await db.update(bookings).set({ status: newStatus }).where(eq(bookings.id, params.id));
	return json({ status: newStatus });
};
