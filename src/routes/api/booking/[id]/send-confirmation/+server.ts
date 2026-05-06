/**
 * POST /api/booking/[id]/send-confirmation
 * Records that a confirmation was sent (timestamp only — actual email
 * is handled client-side via mailto: or copy-to-clipboard).
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		columns: { id: true }
	});
	if (!booking) return json({ error: 'Booking not found' }, { status: 404 });

	const now = new Date();
	await db.update(bookings)
		.set({ confirmationSentAt: now })
		.where(eq(bookings.id, params.id));

	return json({ confirmationSentAt: now.toISOString() });
};
