import { json, error } from '@sveltejs/kit';
import { and, eq, lt, gt, ne, inArray, isNull, lte, gte } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms, roomTypes, rateSeasons, rateTiers, rateOverrides } from '$lib/server/db/schema';

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

	// All active rooms for this property, including quarantine status
	const allRooms = await db.query.rooms.findMany({
		where: and(eq(rooms.propertyId, propertyId), eq(rooms.isActive, true)),
		columns: { id: true, roomTypeId: true, quarantineUntil: true, kingBeds: true, queenBeds: true, doubleBeds: true, hasKitchen: true, hasHideabed: true }
	});

	// Rooms under quarantine during the requested check-in date are treated as unavailable
	const quarantinedRoomIds = new Set(
		allRooms
			.filter((r) => r.quarantineUntil && r.quarantineUntil > checkIn)
			.map((r) => r.id)
	);

	// Rooms already taken by concrete-assigned bookings
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

	// Unassigned bookings by room type for this date range
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

	// Min rates per room type (exclude manual-only seasons)
	const tiers = await db.query.rateTiers.findMany({
		with: {
			season: {
				columns: { startDate: true, endDate: true, isManualOnly: true },
				where: and(
					lte(rateSeasons.startDate, checkOut),
					gte(rateSeasons.endDate, checkIn)
				)
			}
		},
		columns: { roomTypeId: true, nightlyRate: true }
	});
	const minRateByType = new Map<string, number>();
	for (const t of tiers) {
		if (!t.season || t.season.isManualOnly) continue;
		const cur = minRateByType.get(t.roomTypeId);
		if (cur === undefined || t.nightlyRate < cur) minRateByType.set(t.roomTypeId, t.nightlyRate);
	}

	// Load room types for this property
	const propRoomTypes = await db.query.roomTypes.findMany({
		where: eq(roomTypes.propertyId, propertyId),
		columns: { id: true, name: true, category: true, sortOrder: true, description: true, imageUrl: true, maxOccupancy: true, parentRoomTypeId: true },
		orderBy: (rt, { asc }) => [asc(rt.sortOrder)]
	});

	// Parent/child pool mapping
	const childrenOf = new Map<string, string[]>();
	for (const rt of propRoomTypes) {
		if (rt.parentRoomTypeId) {
			const arr = childrenOf.get(rt.parentRoomTypeId) ?? [];
			arr.push(rt.id);
			childrenOf.set(rt.parentRoomTypeId, arr);
		}
	}

	// Fetch rate overrides for all relevant room types in the date range
	// Include the checkout date for CTD checks (use lte instead of lt)
	const allTypeIds = propRoomTypes.map((rt) => rt.id);
	const stayOverrides = allTypeIds.length > 0
		? await db.query.rateOverrides.findMany({
			where: and(
				inArray(rateOverrides.roomTypeId, allTypeIds),
				gte(rateOverrides.date, checkIn),
				lte(rateOverrides.date, checkOut)
			),
			columns: { roomTypeId: true, date: true, stopSell: true, closedToArrival: true, closedToDeparture: true, availabilityOverride: true }
		})
		: [];

	// Group overrides by room type
	const overridesByType = new Map<string, typeof stayOverrides>();
	for (const o of stayOverrides) {
		const arr = overridesByType.get(o.roomTypeId) ?? [];
		arr.push(o);
		overridesByType.set(o.roomTypeId, arr);
	}

	const result: AvailableRoomType[] = propRoomTypes.map((rt) => {
		const isChild    = !!rt.parentRoomTypeId;
		const poolRootId = isChild ? rt.parentRoomTypeId! : rt.id;
		const siblings   = childrenOf.get(poolRootId) ?? [];

		// Stop-sell: blocked if this type OR its parent has any stop_sell date in range
		const myOvr     = overridesByType.get(rt.id) ?? [];
		const parentOvr = isChild ? (overridesByType.get(rt.parentRoomTypeId!) ?? []) : [];
		if (myOvr.some((o) => o.stopSell) || parentOvr.some((o) => o.stopSell)) return null;

		// CTA: blocked if check-in date has closedToArrival on this type or parent
		const myCtaOnCheckIn = myOvr.find((o) => o.date === checkIn)?.closedToArrival ?? false;
		const parentCtaOnCheckIn = isChild ? (parentOvr.find((o) => o.date === checkIn)?.closedToArrival ?? false) : false;
		if (myCtaOnCheckIn || parentCtaOnCheckIn) return null;

		// CTD: blocked if check-out date has closedToDeparture on this type or parent
		const myCtdOnCheckOut = myOvr.find((o) => o.date === checkOut)?.closedToDeparture ?? false;
		const parentCtdOnCheckOut = isChild ? (parentOvr.find((o) => o.date === checkOut)?.closedToDeparture ?? false) : false;
		if (myCtdOnCheckOut || parentCtdOnCheckOut) return null;

		// Physical rooms belong to the pool root
		const poolRooms  = allRooms.filter((r) => r.roomTypeId === poolRootId);
		const totalCount = poolRooms.length;

		// Availability override (on parent/standalone): cap the total
		const poolOvr      = isChild ? parentOvr : myOvr;
		const avOvrs       = poolOvr.filter((o) => o.availabilityOverride !== null);
		const overrideCap  = avOvrs.length > 0 ? Math.min(...avOvrs.map((o) => o.availabilityOverride!)) : totalCount;
		const effectiveTotal = Math.min(totalCount, overrideCap);

		// Taken: rooms assigned to conflicting bookings + quarantined rooms + unassigned bookings across the whole pool
		const takenRooms      = poolRooms.filter((r) => conflictedRoomIds.has(r.id) || quarantinedRoomIds.has(r.id)).length;
		const poolTypeIds     = [poolRootId, ...siblings];
		const takenUnassigned = poolTypeIds.reduce((s, tid) => s + (unassignedByType.get(tid) ?? 0), 0);

		const availableCount = Math.max(0, effectiveTotal - takenRooms - takenUnassigned);

		const rep = poolRooms[0] ?? null;

		return {
			id:            rt.id,
			name:          rt.name,
			category:      rt.category,
			sortOrder:     rt.sortOrder,
			description:   rt.description ?? null,
			imageUrl:      rt.imageUrl ?? null,
			maxOccupancy:  rt.maxOccupancy ?? null,
			availableCount,
			totalCount:    effectiveTotal,
			minRateCents:  minRateByType.get(rt.id) ?? null,
			beds: rep ? {
				kingBeds:    rep.kingBeds,
				queenBeds:   rep.queenBeds,
				doubleBeds:  rep.doubleBeds,
				hasKitchen:  rep.hasKitchen,
				hasHideabed: rep.hasHideabed
			} : null
		};
	})
	.filter((rt): rt is AvailableRoomType => rt !== null && rt.availableCount > 0);

	return json(result);
};
