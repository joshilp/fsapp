import { json, error } from '@sveltejs/kit';
import { and, eq, lt, gt, ne, inArray, isNull, lte, gte } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms, roomTypes, rateSeasons, rateTiers } from '$lib/server/db/schema';

export type AvailableRoomType = {
	id: string;
	name: string;
	category: string;
	sortOrder: number;
	availableCount: number;
	totalCount: number;
	minRateCents: number | null;
	description: string | null;
	imageUrl: string | null;
	maxOccupancy: number | null;
	// bed / amenity summary for display
	beds: {
		kingBeds: number;
		queenBeds: number;
		doubleBeds: number;
		hasKitchen: boolean;
		hasHideabed: boolean;
	} | null;
};

export const GET: RequestHandler = async ({ url }) => {
	const propertyId = url.searchParams.get('propertyId');
	const checkIn    = url.searchParams.get('checkIn');
	const checkOut   = url.searchParams.get('checkOut');

	if (!propertyId || !checkIn || !checkOut || checkIn >= checkOut) {
		throw error(400, 'Missing or invalid params');
	}

	// All active rooms for this property, grouped by type
	const allRooms = await db.query.rooms.findMany({
		where: and(eq(rooms.propertyId, propertyId), eq(rooms.isActive, true)),
		columns: { id: true, roomTypeId: true, kingBeds: true, queenBeds: true, doubleBeds: true, hasKitchen: true, hasHideabed: true }
	});

	// Rooms already taken by bookings with a concrete roomId
	const allRoomIds = allRooms.map((r) => r.id);
	const conflictedRoomIds = allRoomIds.length > 0
		? new Set(
			(await db
				.select({ roomId: bookings.roomId })
				.from(bookings)
				.where(and(
					lt(bookings.checkInDate, checkOut),
					gt(bookings.checkOutDate, checkIn),
					ne(bookings.status, 'cancelled'),
					ne(bookings.status, 'blocked'),
					inArray(bookings.roomId, allRoomIds)
				))
			).map((r) => r.roomId).filter((id): id is string => id !== null)
		)
		: new Set<string>();

	// Unassigned online bookings by room type for this date range
	const unassignedConflicts = await db
		.select({ roomTypeId: bookings.requestedRoomTypeId })
		.from(bookings)
		.where(and(
			lt(bookings.checkInDate, checkOut),
			gt(bookings.checkOutDate, checkIn),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
			isNull(bookings.roomId),
			eq(bookings.propertyId, propertyId)
		));
	const unassignedByType = new Map<string, number>();
	for (const b of unassignedConflicts) {
		if (b.roomTypeId) unassignedByType.set(b.roomTypeId, (unassignedByType.get(b.roomTypeId) ?? 0) + 1);
	}

	// Min rates per room type
	const tiers = await db.query.rateTiers.findMany({
		with: {
			season: {
				columns: { startDate: true, endDate: true },
				where: and(lte(rateSeasons.startDate, checkOut), gte(rateSeasons.endDate, checkIn))
			}
		},
		columns: { roomTypeId: true, nightlyRate: true }
	});
	const minRateByType = new Map<string, number>();
	for (const t of tiers) {
		if (!t.season) continue;
		const cur = minRateByType.get(t.roomTypeId);
		if (cur === undefined || t.nightlyRate < cur) minRateByType.set(t.roomTypeId, t.nightlyRate);
	}

	// Load room types for this property
	const propRoomTypes = await db.query.roomTypes.findMany({
		where: eq(roomTypes.propertyId, propertyId),
		columns: { id: true, name: true, category: true, sortOrder: true, description: true, imageUrl: true, maxOccupancy: true },
		orderBy: (rt, { asc }) => [asc(rt.sortOrder)]
	});

	const result: AvailableRoomType[] = propRoomTypes.map((rt) => {
		const rtRooms     = allRooms.filter((r) => r.roomTypeId === rt.id);
		const totalCount  = rtRooms.length;
		const taken       = rtRooms.filter((r) => conflictedRoomIds.has(r.id)).length + (unassignedByType.get(rt.id) ?? 0);
		const availableCount = Math.max(0, totalCount - taken);

		const rep = rtRooms[0] ?? null;

		return {
			id:            rt.id,
			name:          rt.name,
			category:      rt.category,
			sortOrder:     rt.sortOrder,
			description:   rt.description ?? null,
			imageUrl:      rt.imageUrl ?? null,
			maxOccupancy:  rt.maxOccupancy ?? null,
			availableCount,
			totalCount,
			minRateCents:  minRateByType.get(rt.id) ?? null,
			beds: rep ? {
				kingBeds:   rep.kingBeds,
				queenBeds:  rep.queenBeds,
				doubleBeds: rep.doubleBeds,
				hasKitchen: rep.hasKitchen,
				hasHideabed: rep.hasHideabed
			} : null
		};
	}).filter((rt) => rt.availableCount > 0); // only return types with availability

	return json(result);
};
