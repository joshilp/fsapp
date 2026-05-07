import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rooms, bookings } from '$lib/server/db/schema';
import { and, eq, lt, gt, ne, inArray } from 'drizzle-orm';

/**
 * GET /api/rooms/available
 *
 * Returns available rooms (no conflicting non-cancelled booking) for a date range.
 *
 * Filter by room type:   ?roomTypeId=X&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 * Filter by property:    ?propertyId=X&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 *
 * Optional: &excludeRoomId=Y to omit the currently-assigned room from results.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const roomTypeId  = url.searchParams.get('roomTypeId');
	const propertyId  = url.searchParams.get('propertyId');
	const checkIn     = url.searchParams.get('checkIn');
	const checkOut    = url.searchParams.get('checkOut');
	const excludeRoom = url.searchParams.get('excludeRoomId');

	if ((!roomTypeId && !propertyId) || !checkIn || !checkOut || checkIn >= checkOut) return json([]);

	const roomList = await db.query.rooms.findMany({
		where: and(
			roomTypeId  ? eq(rooms.roomTypeId,  roomTypeId)  : undefined,
			propertyId  ? eq(rooms.propertyId,  propertyId)  : undefined,
			eq(rooms.isActive, true)
		),
		columns: { id: true, roomNumber: true },
		with: { roomType: { columns: { name: true } } }
	});

	if (!roomList.length) return json([]);

	const roomIds = roomList.map((r) => r.id);

	const conflicting = await db.query.bookings.findMany({
		where: and(
			inArray(bookings.roomId, roomIds),
			lt(bookings.checkInDate, checkOut),
			gt(bookings.checkOutDate, checkIn),
			ne(bookings.status, 'cancelled')
		),
		columns: { roomId: true }
	});

	const conflictIds = new Set(conflicting.map((b) => b.roomId));

	return json(
		roomList
			.filter((r) => !conflictIds.has(r.id) && r.id !== excludeRoom)
			.map((r) => ({ id: r.id, roomNumber: r.roomNumber, roomTypeName: r.roomType?.name ?? '' }))
	);
};
