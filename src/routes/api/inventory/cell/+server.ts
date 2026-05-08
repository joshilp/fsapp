import { json, error } from '@sveltejs/kit';
import { and, eq, lt, gt, inArray, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

const ACTIVE = ['reserved', 'confirmed', 'checked_in'] as const;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const roomTypeId = url.searchParams.get('roomTypeId');
	const date       = url.searchParams.get('date');
	if (!roomTypeId || !date) throw error(400, 'Missing roomTypeId or date');

	// Rooms belonging to this room type
	const roomsOfType = await db.query.rooms.findMany({
		where: eq(rooms.roomTypeId, roomTypeId),
		columns: { id: true, roomNumber: true }
	});
	const roomIds      = roomsOfType.map((r) => r.id);
	const roomNumMap   = new Map(roomsOfType.map((r) => [r.id, r.roomNumber]));

	// Match bookings assigned to a room of this type OR unassigned but requesting this type
	function typeFilter() {
		const byRoom = roomIds.length > 0 ? inArray(bookings.roomId, roomIds) : undefined;
		const byRt   = eq(bookings.requestedRoomTypeId, roomTypeId);
		return byRoom ? or(byRoom, byRt) : byRt;
	}

	function nights(ci: string, co: string) {
		return Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000);
	}

	const [checkingIn, checkingOut, stayingThrough] = await Promise.all([
		db.query.bookings.findMany({
			where: and(eq(bookings.checkInDate, date),  inArray(bookings.status, [...ACTIVE]), typeFilter()),
			with:  { guest: { columns: { name: true } } },
			columns: { id: true, roomId: true, checkInDate: true, checkOutDate: true }
		}),
		db.query.bookings.findMany({
			where: and(eq(bookings.checkOutDate, date), inArray(bookings.status, [...ACTIVE]), typeFilter()),
			with:  { guest: { columns: { name: true } } },
			columns: { id: true, roomId: true, checkInDate: true, checkOutDate: true }
		}),
		db.query.bookings.findMany({
			where: and(lt(bookings.checkInDate, date), gt(bookings.checkOutDate, date), inArray(bookings.status, [...ACTIVE]), typeFilter()),
			columns: { id: true }
		})
	]);

	return json({
		checkingIn: checkingIn.map((b) => ({
			id:         b.id,
			guestName:  b.guest?.name ?? 'Guest TBD',
			roomNumber: b.roomId ? (roomNumMap.get(b.roomId) ?? null) : null,
			nights:     nights(b.checkInDate, b.checkOutDate)
		})),
		checkingOut: checkingOut.map((b) => ({
			id:         b.id,
			guestName:  b.guest?.name ?? 'Guest TBD',
			roomNumber: b.roomId ? (roomNumMap.get(b.roomId) ?? null) : null
		})),
		stayingThrough: stayingThrough.length
	});
};
