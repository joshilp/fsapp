/**
 * Shared ARI (Availability, Rates, Inventory) sync helpers.
 *
 * Called after any event that changes availability for a room type:
 *   - booking created (any source: operator, online, group)
 *   - booking cancelled
 *   - booking checked out (room becomes available again for future dates)
 *   - rate override saved/deleted (handled separately in /api/ari/override)
 *
 * All pushes are fire-and-forget (non-blocking). A failed push only means
 * Channex is temporarily out of sync — the local DB is always the source of
 * truth and the operator can force a re-sync via the Inventory page.
 */
import { and, eq, lt, gt, ne, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bookings, rateOverrides, rateSeasons, rateTiers, rooms, roomTypes } from '$lib/server/db/schema';
import { pushARI } from '$lib/server/channex';

/**
 * Compute current availability + effective rate for a single date and push to
 * Channex. Safe to call without await — errors are swallowed.
 *
 * @param roomTypeId  internal UUID of the room type
 * @param date        YYYY-MM-DD — the date to re-compute (single day push)
 */
export async function syncARIForDate(roomTypeId: string, date: string): Promise<void> {
	try {
		await _pushForDate(roomTypeId, date);
	} catch (err) {
		console.error('[ari-sync] push failed:', err);
	}
}

/**
 * Re-sync availability for every night of a booking's stay.
 * Use after a booking is created or cancelled so all affected nights are updated.
 */
export async function syncARIForStay(roomTypeId: string, checkIn: string, checkOut: string): Promise<void> {
	const nights = Math.round(
		(new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
	);
	if (nights <= 0 || !roomTypeId) return;

	// Build one update per night then batch-push
	const updates: Parameters<typeof pushARI>[0] = [];

	const rt = await db.query.roomTypes.findFirst({
		where: eq(roomTypes.id, roomTypeId),
		with: { property: true }
	});
	if (!rt?.channexRoomTypeId || !rt?.channexRatePlanId || !rt.property?.channexPropertyId) return;

	const propId = rt.propertyId;
	const roomList = await db.query.rooms.findMany({
		where: and(eq(rooms.roomTypeId, roomTypeId), eq(rooms.isActive, true)),
		columns: { id: true }
	});
	const totalRooms = roomList.length;
	const roomIds = roomList.map((r) => r.id);

	const seasons = await db.query.rateSeasons.findMany({
		where: eq(rateSeasons.propertyId, propId),
		with: { tiers: { where: eq(rateTiers.roomTypeId, roomTypeId) } },
		orderBy: (s, { asc }) => [asc(s.startDate)]
	});

	for (let i = 0; i < nights; i++) {
		const date = addDays(checkIn, i);

		const avail = await computeAvailability(roomTypeId, roomIds, totalRooms, date);
		const { rate, minNights } = getRateForDate(seasons, roomTypeId, date, rt.defaultRateCents);
		const override = await db.query.rateOverrides.findFirst({
			where: and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, date))
		});

		const effectiveRate = override?.rateCents ?? rate;
		if (!effectiveRate) continue; // no rate configured

		updates.push({
			channexPropertyId: rt.property.channexPropertyId!,
			channexRoomTypeId: rt.channexRoomTypeId!,
			channexRatePlanId: rt.channexRatePlanId!,
			dateFrom: date,
			dateTo: date,
			availability: avail,
			rateCents: effectiveRate,
			minNights: override?.minNights ?? minNights,
			stopSell: override?.stopSell ?? false,
			closedToArrival: override?.closedToArrival ?? false,
			closedToDeparture: override?.closedToDeparture ?? false
		});
	}

	if (updates.length > 0) {
		await pushARI(updates);
	}
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _pushForDate(roomTypeId: string, date: string): Promise<void> {
	const rt = await db.query.roomTypes.findFirst({
		where: eq(roomTypes.id, roomTypeId),
		with: { property: true }
	});
	if (!rt?.channexRoomTypeId || !rt?.channexRatePlanId || !rt.property?.channexPropertyId) return;

	const roomList = await db.query.rooms.findMany({
		where: and(eq(rooms.roomTypeId, roomTypeId), eq(rooms.isActive, true)),
		columns: { id: true }
	});
	const roomIds = roomList.map((r) => r.id);
	const totalRooms = roomList.length;

	const avail = await computeAvailability(roomTypeId, roomIds, totalRooms, date);
	const seasons = await db.query.rateSeasons.findMany({
		where: eq(rateSeasons.propertyId, rt.propertyId),
		with: { tiers: { where: eq(rateTiers.roomTypeId, roomTypeId) } }
	});
	const { rate, minNights } = getRateForDate(seasons, roomTypeId, date, rt.defaultRateCents);
	const override = await db.query.rateOverrides.findFirst({
		where: and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, date))
	});

	const effectiveRate = override?.rateCents ?? rate;
	if (!effectiveRate) return;

	// If an availabilityOverride is set, use it as the selling cap (but never exceed real availability)
	const effectiveAvail = override?.availabilityOverride != null
		? Math.min(avail, override.availabilityOverride)
		: avail;

	await pushARI([{
		channexPropertyId: rt.property.channexPropertyId!,
		channexRoomTypeId: rt.channexRoomTypeId!,
		channexRatePlanId: rt.channexRatePlanId!,
		dateFrom: date,
		dateTo: date,
		availability: effectiveAvail,
		rateCents: effectiveRate,
		minNights: override?.minNights ?? minNights,
		stopSell: override?.stopSell ?? false,
		closedToArrival: override?.closedToArrival ?? false,
		closedToDeparture: override?.closedToDeparture ?? false
	}]);
}

/**
 * Count available rooms for a room type on a specific date.
 * Accounts for both assigned (roomId set) and unassigned (requestedRoomTypeId set) bookings.
 */
async function computeAvailability(
	roomTypeId: string,
	roomIds: string[],
	totalRooms: number,
	date: string
): Promise<number> {
	// Bookings with a concrete room assignment that cover this date
	const assignedCount = roomIds.length > 0
		? (await db
			.select({ id: bookings.id })
			.from(bookings)
			.where(and(
				inArray(bookings.roomId, roomIds),
				ne(bookings.status, 'cancelled'),
				ne(bookings.status, 'blocked'),
				ne(bookings.status, 'checked_out'),
				lt(bookings.checkInDate, addDays(date, 1)), // checkIn <= date
				gt(bookings.checkOutDate, date)             // checkOut > date
			))
		).length
		: 0;

	// Unassigned online/OTA bookings for this room type that cover this date
	const unassignedCount = (await db
		.select({ id: bookings.id })
		.from(bookings)
		.where(and(
			isNull(bookings.roomId),
			eq(bookings.requestedRoomTypeId, roomTypeId),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
			lt(bookings.checkInDate, addDays(date, 1)),
			gt(bookings.checkOutDate, date)
		))
	).length;

	return Math.max(0, totalRooms - assignedCount - unassignedCount);
}

function getRateForDate(
	seasons: Array<{ startDate: string; endDate: string; minNights: number; tiers: Array<{ roomTypeId: string; nightlyRate: number }> }>,
	roomTypeId: string,
	date: string,
	defaultRateCents?: number | null
): { rate: number | null; minNights: number } {
	// Collect all seasons that cover this date and have a tier for this room type
	// Sort shortest range first — most specific (shortest) season wins
	const matching = seasons
		.filter(s => s.startDate <= date && s.endDate >= date)
		.sort((a, b) => rangeDays(a) - rangeDays(b));

	for (const s of matching) {
		const tier = s.tiers.find((t) => t.roomTypeId === roomTypeId);
		if (tier) return { rate: tier.nightlyRate, minNights: s.minNights };
	}
	// Fallback to room type default rate when no season applies
	return { rate: defaultRateCents ?? null, minNights: 1 };
}

function rangeDays(s: { startDate: string; endDate: string }): number {
	return Math.round(
		(new Date(s.endDate + 'T12:00:00').getTime() - new Date(s.startDate + 'T12:00:00').getTime()) / 86400000
	);
}

function addDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}
