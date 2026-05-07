import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rooms, bookings } from '$lib/server/db/schema';
import { and, eq, lt, gt, ne, inArray } from 'drizzle-orm';

/** GET /api/rooms/available?roomTypeId=X&checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD
 *  Returns rooms of the given type that have no confirmed/checked_in booking
 *  overlapping the requested date range. */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const roomTypeId = url.searchParams.get('roomTypeId');
	const checkIn   = url.searchParams.get('checkIn');
	const checkOut  = url.searchParams.get('checkOut');

	if (!roomTypeId || !checkIn || !checkOut || checkIn >= checkOut) return json([]);

	const roomList = await db.query.rooms.findMany({
		where: and(eq(rooms.roomTypeId, roomTypeId), eq(rooms.isActive, true)),
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
			.filter((r) => !conflictIds.has(r.id))
			.map((r) => ({ id: r.id, roomNumber: r.roomNumber, roomTypeName: r.roomType?.name ?? '' }))
	);
};
