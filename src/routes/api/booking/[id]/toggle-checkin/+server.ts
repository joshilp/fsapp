import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

/** POST /api/booking/[id]/toggle-checkin
 *  If checked_in → revert to confirmed (un-check-in)
 *  If confirmed  → set checked_in
 *  Returns { status, checkedInAt }
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const id = params.id;

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, id),
		columns: { id: true, status: true, checkedInAt: true }
	});
	if (!booking) return json({ error: 'Not found' }, { status: 404 });

	let newStatus: string;
	let checkedInAt: Date | null;

	if (booking.status === 'checked_in') {
		// Un-check-in
		newStatus = 'confirmed';
		checkedInAt = null;
	} else {
		// Check in
		newStatus = 'checked_in';
		checkedInAt = new Date();
	}

	await db.update(bookings).set({ status: newStatus, checkedInAt }).where(eq(bookings.id, id));

	return json({ status: newStatus, checkedInAt: checkedInAt?.getTime() ?? null });
};
