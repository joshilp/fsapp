/**
 * GET  /api/booking/[id]/self-checkin-link
 *   Returns (or generates) the self check-in token + full URL for this booking.
 *
 * DELETE /api/booking/[id]/self-checkin-link
 *   Revokes the token so the link stops working.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';
import { nanoid } from 'nanoid';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		columns: { id: true, selfCheckinToken: true, selfCheckinAt: true }
	});
	if (!booking) return json({ error: 'Not found' }, { status: 404 });

	let token = booking.selfCheckinToken;

	// Generate token if not yet created
	if (!token) {
		token = nanoid(32);
		await db.update(bookings)
			.set({ selfCheckinToken: token })
			.where(eq(bookings.id, params.id));
	}

	const origin = url.origin;
	return json({
		token,
		url: `${origin}/checkin/${token}`,
		completedAt: booking.selfCheckinAt ?? null,
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	await db.update(bookings)
		.set({ selfCheckinToken: null, selfCheckinAt: null })
		.where(eq(bookings.id, params.id));

	return json({ ok: true });
};
