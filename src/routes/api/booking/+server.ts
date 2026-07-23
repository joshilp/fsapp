/**
 * POST /api/booking
 * Minimal booking creation for operator / test use.
 * Creates a guest (find-or-create by email) + booking.
 * Returns the new booking id and status.
 * Requires authentication.
 */
import { json, error } from '@sveltejs/kit';
import { and, eq, lt, gt, ne } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, guests, rooms } from '$lib/server/db/schema';
import { syncARIForStay } from '$lib/server/ari-sync';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json().catch(() => null);
	if (!body) throw error(400, 'JSON body required');

	const {
		propertyId, roomId, requestedRoomTypeId,
		checkInDate, checkOutDate,
		numAdults = 1, numChildren = 0,
		guestName, guestEmail, guestPhone,
		notes, status = 'confirmed'
	} = body as Record<string, string | number | undefined>;

	if (!propertyId || !checkInDate || !checkOutDate || !guestName) {
		throw error(400, 'propertyId, checkInDate, checkOutDate, guestName are required');
	}

	// Conflict check when a specific room is requested
	if (roomId) {
		const room = await db.query.rooms.findFirst({
			where: and(eq(rooms.id, roomId as string), eq(rooms.propertyId, propertyId as string)),
			columns: { id: true, isActive: true }
		});
		if (!room || !room.isActive) throw error(404, 'Room not found');

		const conflict = await db.query.bookings.findFirst({
			where: and(
				eq(bookings.roomId, roomId as string),
				lt(bookings.checkInDate, checkOutDate as string),
				gt(bookings.checkOutDate, checkInDate as string),
				ne(bookings.status, 'cancelled')
			),
			columns: { id: true }
		});
		if (conflict) throw error(409, 'Room is not available for those dates');
	}

	// Find or create guest
	let guestId: string;
	if (guestEmail) {
		const existing = await db.query.guests.findFirst({
			where: eq(guests.email, guestEmail as string),
			columns: { id: true }
		});
		if (existing) {
			guestId = existing.id;
		} else {
			guestId = crypto.randomUUID();
			await db.insert(guests).values({
				id: guestId,
				name: guestName as string,
				email: guestEmail as string,
				phone: guestPhone as string ?? null
			});
		}
	} else {
		guestId = crypto.randomUUID();
		await db.insert(guests).values({
			id: guestId,
			name: guestName as string,
			phone: guestPhone as string ?? null
		});
	}

	const id = crypto.randomUUID();
	await db.insert(bookings).values({
		id,
		propertyId: propertyId as string,
		roomId: roomId as string ?? null,
		requestedRoomTypeId: requestedRoomTypeId as string ?? null,
		guestId,
		checkInDate: checkInDate as string,
		checkOutDate: checkOutDate as string,
		numAdults: Number(numAdults),
		numChildren: Number(numChildren),
		status: status as string,
		notes: notes as string ?? null
	});

	// Fire-and-forget ARI sync if room type is known
	if (roomId) {
		const room = await db.query.rooms.findFirst({
			where: eq(rooms.id, roomId as string),
			columns: { roomTypeId: true }
		});
		if (room?.roomTypeId) {
			void syncARIForStay(room.roomTypeId, checkInDate as string, checkOutDate as string).catch((e) => console.error('[ari-sync] api/booking POST:', e));
		}
	}

	return json({ id, status, propertyId, roomId: roomId ?? null }, { status: 201 });
};
