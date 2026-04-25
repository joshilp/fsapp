import { json } from '@sveltejs/kit';
import { and, eq, gt, inArray, lt, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

// Days of context shown on either side of the requested stay
const STRIP_PRE = 8;
const STRIP_POST = 16;

function addDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const checkIn = url.searchParams.get('checkIn') ?? '';
	const checkOut = url.searchParams.get('checkOut') ?? '';
	const minBeds = parseInt(url.searchParams.get('minBeds') ?? '1', 10);
	const kitchen = url.searchParams.get('kitchen') === '1';

	if (!checkIn || !checkOut || checkIn >= checkOut) {
		return json({ error: 'Invalid dates' }, { status: 400 });
	}

	// Rooms with a conflicting booking during the requested window
	const conflictedRoomIds = (
		await db
			.select({ roomId: bookings.roomId })
			.from(bookings)
			.where(
				and(
					lt(bookings.checkInDate, checkOut),
					gt(bookings.checkOutDate, checkIn),
					ne(bookings.status, 'cancelled')
				)
			)
	)
		.map((r) => r.roomId)
		.filter((id): id is string => id !== null);

	// All active rooms with type + property info
	const allRooms = await db.query.rooms.findMany({
		where: eq(rooms.isActive, true),
		with: {
			roomType: { columns: { category: true, name: true } },
			property: { columns: { id: true, name: true } }
		},
		orderBy: [sql`CAST(${rooms.roomNumber} AS INTEGER) ASC`]
	});

	const available = allRooms.filter((r) => {
		if (conflictedRoomIds.includes(r.id)) return false;
		const total = (r.kingBeds ?? 0) + r.queenBeds + r.doubleBeds + (r.hasHideabed ? 1 : 0);
		if (total < minBeds) return false;
		if (kitchen && !r.hasKitchen) return false;
		return true;
	});

	// Fetch nearby bookings for context strip (±STRIP_PRE/POST days around the stay)
	const contextStart = addDays(checkIn, -STRIP_PRE);
	const contextEnd = addDays(checkOut, STRIP_POST);
	const availableIds = available.map((r) => r.id);

	const nearbyRows =
		availableIds.length > 0
			? await db.query.bookings.findMany({
					where: and(
						inArray(bookings.roomId, availableIds),
						lt(bookings.checkInDate, contextEnd),
						gt(bookings.checkOutDate, contextStart),
						ne(bookings.status, 'cancelled')
					),
					with: {
						guest: { columns: { name: true } },
						channel: { columns: { name: true } }
					},
					columns: { id: true, roomId: true, checkInDate: true, checkOutDate: true, status: true }
				})
			: [];

	// Group nearby bookings by room
	const nearbyByRoom = new Map<string, typeof nearbyRows>();
	for (const b of nearbyRows) {
		if (!b.roomId) continue;
		if (!nearbyByRoom.has(b.roomId)) nearbyByRoom.set(b.roomId, []);
		nearbyByRoom.get(b.roomId)!.push(b);
	}

	const result = available.map((r) => ({
		id: r.id,
		roomNumber: r.roomNumber,
		propertyId: r.property?.id ?? r.propertyId,
		propertyName: r.property?.name ?? r.propertyId,
		kingBeds: r.kingBeds ?? 0,
		queenBeds: r.queenBeds,
		doubleBeds: r.doubleBeds,
		hasHideabed: r.hasHideabed,
		hasKitchen: r.hasKitchen,
		configs: r.configs ? (JSON.parse(r.configs) as string[]) : null,
		category: r.roomType?.category ?? null,
		typeName: r.roomType?.name ?? null,
		nearbyBookings: (nearbyByRoom.get(r.id) ?? []).map((b) => ({
			checkInDate: b.checkInDate,
			checkOutDate: b.checkOutDate,
			guestName: b.guest?.name ?? null,
			channelName: b.channel?.name ?? null,
			status: b.status
		}))
	}));

	return json(result);
};
