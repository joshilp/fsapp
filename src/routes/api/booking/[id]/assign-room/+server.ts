import { json } from '@sveltejs/kit';
import { eq, and, lt, gt, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { id } = params;
	const body = await request.json().catch(() => ({}));
	const roomId = body.roomId as string | undefined;
	if (!roomId) return json({ error: 'roomId required' }, { status: 400 });

	// Load the booking
	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, id),
		columns: { id: true, roomId: true, checkInDate: true, checkOutDate: true, status: true, propertyId: true }
	});
	if (!booking) return json({ error: 'Booking not found' }, { status: 404 });

	// Verify room belongs to same property
	const room = await db.query.rooms.findFirst({
		where: and(eq(rooms.id, roomId), eq(rooms.propertyId, booking.propertyId)),
		columns: { id: true, roomNumber: true, isActive: true }
	});
	if (!room || !room.isActive) return json({ error: 'Room not found' }, { status: 404 });

	// Check no conflict with the target room
	const conflict = await db.query.bookings.findFirst({
		where: and(
			eq(bookings.roomId, roomId),
			lt(bookings.checkInDate, booking.checkOutDate),
			gt(bookings.checkOutDate, booking.checkInDate),
			ne(bookings.status, 'cancelled'),
			ne(bookings.id, id)
		),
		columns: { id: true }
	});
	if (conflict) return json({ error: `Room ${room.roomNumber} is not available for those dates.` }, { status: 409 });

	await db.update(bookings).set({ roomId }).where(eq(bookings.id, id));
	return json({ success: true, roomNumber: room.roomNumber });
};
