/**
 * Shared ARI (Availability, Rates, Inventory) sync helpers.
 *
 * Called after any event that changes availability or rates for a room type.
 * All public exports are fire-and-forget safe (errors are logged, not thrown).
 *
 * Pool-aware: when a room type shares inventory with a parent (parent/child
 * model), ALL siblings are re-synced together so every OTA sees the correct
 * shared availability count.
 */
import { and, eq, gt, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bookings, rateOverrides, rateSeasons, rateTiers, rooms, roomTypes } from '$lib/server/db/schema';
import { pushARI } from '$lib/server/channex';
import type { ARIUpdate } from '$lib/server/channex';

// ─── Public API ───────────────────────────────────────────────────────────────

/** Re-sync a single date for a room type (and all pool siblings). */
export async function syncARIForDate(roomTypeId: string, date: string): Promise<void> {
	try {
		const pool = await resolvePool(roomTypeId);
		await _pushDatesForPool(pool, [date]);
	} catch (err) {
		console.error('[ari-sync] syncARIForDate failed:', err);
	}
}

/** Re-sync every night of a stay for a room type (and all pool siblings). */
export async function syncARIForStay(roomTypeId: string, checkIn: string, checkOut: string): Promise<void> {
	try {
		const nights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
		if (nights <= 0 || !roomTypeId) return;
		const dates = Array.from({ length: nights }, (_, i) => addDays(checkIn, i));
		const pool = await resolvePool(roomTypeId);
		await _pushDatesForPool(pool, dates);
	} catch (err) {
		console.error('[ari-sync] syncARIForStay failed:', err);
	}
}

/**
 * Re-sync a full date range for a room type (and all pool siblings).
 * Called after rate tier or season changes so Channex stays current.
 * Only future dates are pushed (past dates are irrelevant to OTAs).
 */
export async function syncARIForDateRange(roomTypeId: string, startDate: string, endDate: string): Promise<void> {
	try {
		const today = new Date().toISOString().slice(0, 10);
		const from = startDate < today ? today : startDate;
		if (from > endDate) return;
		const nights = Math.round((new Date(endDate).getTime() - new Date(from).getTime()) / 86400000);
		const dates = Array.from({ length: nights + 1 }, (_, i) => addDays(from, i));
		const pool = await resolvePool(roomTypeId);
		await _pushDatesForPool(pool, dates);
	} catch (err) {
		console.error('[ari-sync] syncARIForDateRange failed:', err);
	}
}

/**
 * Full re-sync for all room types in a property for the next `daysAhead` days.
 * Called from the Settings → Channex "Sync now" button or on initial setup.
 * Returns a summary of how many room type pools were synced vs errored.
 */
export async function syncAllARIForProperty(
	propertyId: string,
	daysAhead = 365
): Promise<{ synced: number; skipped: number; errors: number }> {
	const today = new Date().toISOString().slice(0, 10);
	const dates = Array.from({ length: daysAhead }, (_, i) => addDays(today, i));

	// Only process root-level room types (no parent). Children are handled when
	// we resolve the pool for the root.
	const rootTypes = await db.query.roomTypes.findMany({
		where: and(eq(roomTypes.propertyId, propertyId), isNull(roomTypes.parentRoomTypeId)),
		columns: { id: true, channexRoomTypeId: true }
	});

	let synced = 0, skipped = 0, errors = 0;

	for (const rt of rootTypes) {
		if (!rt.channexRoomTypeId) { skipped++; continue; }
		try {
			const pool = await resolvePool(rt.id);
			await _pushDatesForPool(pool, dates);
			synced++;
		} catch (err) {
			console.error('[ari-sync] syncAll failed for', rt.id, err);
			errors++;
		}
	}

	return { synced, skipped, errors };
}

// ─── Pool resolution ──────────────────────────────────────────────────────────

type Pool = {
	poolRootId: string;
	allTypeIds: string[];
	roomIds: string[];
	totalRooms: number;
	propId: string;
};

async function resolvePool(roomTypeId: string): Promise<Pool> {
	const rt = await db.query.roomTypes.findFirst({
		where: eq(roomTypes.id, roomTypeId),
		columns: { id: true, parentRoomTypeId: true, propertyId: true }
	});
	if (!rt) return { poolRootId: roomTypeId, allTypeIds: [roomTypeId], roomIds: [], totalRooms: 0, propId: '' };

	const poolRootId = rt.parentRoomTypeId ?? roomTypeId;

	// All room types that share this pool: the root + all its children
	const siblings = await db.query.roomTypes.findMany({
		where: or(eq(roomTypes.id, poolRootId), eq(roomTypes.parentRoomTypeId, poolRootId)),
		columns: { id: true }
	});

	// Physical rooms always live under the pool root
	const roomList = await db.query.rooms.findMany({
		where: and(eq(rooms.roomTypeId, poolRootId), eq(rooms.isActive, true)),
		columns: { id: true }
	});

	return {
		poolRootId,
		allTypeIds: siblings.map((s) => s.id),
		roomIds: roomList.map((r) => r.id),
		totalRooms: roomList.length,
		propId: rt.propertyId
	};
}

// ─── Core push logic ──────────────────────────────────────────────────────────

/**
 * For every pool member that has Channex IDs configured, push updates for the
 * given list of dates. All pool members share the same availability count but
 * each has its own rate/minNights/flags.
 */
async function _pushDatesForPool(pool: Pool, dates: string[]): Promise<void> {
	if (dates.length === 0 || !pool.propId) return;

	const poolRoomTypes = await db.query.roomTypes.findMany({
		where: inArray(roomTypes.id, pool.allTypeIds),
		with: { property: { columns: { channexPropertyId: true } } }
	});

	const configured = poolRoomTypes.filter(
		(rt) => rt.channexRoomTypeId && rt.channexRatePlanId && rt.property?.channexPropertyId
	);
	if (configured.length === 0) return;

	// Fetch non-manual seasons for rate lookups
	const seasons = await db.query.rateSeasons.findMany({
		where: and(eq(rateSeasons.propertyId, pool.propId), eq(rateSeasons.isManualOnly, false)),
		with: { tiers: true },
		orderBy: (s, { asc }) => [asc(s.startDate)]
	});

	// Fetch all relevant overrides in one query
	const minDate = dates[0];
	const maxDate = dates[dates.length - 1];
	const overridesList = await db.query.rateOverrides.findMany({
		where: and(
			inArray(rateOverrides.roomTypeId, pool.allTypeIds),
			gt(rateOverrides.date, addDays(minDate, -1)),
			lt(rateOverrides.date, addDays(maxDate, 1))
		)
	});
	const overrideMap = new Map(overridesList.map((o) => [`${o.roomTypeId}|${o.date}`, o]));

	// Pre-compute availability for every date in one pass (two DB queries total)
	const availByDate = await computePoolAvailabilityForDates(
		pool.allTypeIds,
		pool.roomIds,
		pool.totalRooms,
		dates
	);

	const updates: ARIUpdate[] = [];

	for (const date of dates) {
		const poolAvail = availByDate.get(date) ?? 0;

		for (const rt of configured) {
			const override = overrideMap.get(`${rt.id}|${date}`);
			const { rate, minNights } = getRateForDate(seasons, rt.id, date, rt.defaultRateCents);
			const effectiveRate = override?.rateCents ?? rate;
			if (!effectiveRate) continue;

			const effectiveAvail =
				override?.availabilityOverride != null
					? Math.min(poolAvail, override.availabilityOverride)
					: poolAvail;

			updates.push({
				channexPropertyId: rt.property!.channexPropertyId!,
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
			});
		}
	}

	if (updates.length > 0) {
		await pushARI(updates);
	}
}

// ─── Availability calculation ─────────────────────────────────────────────────

/**
 * Compute pool availability for a list of dates in two DB queries (one for
 * assigned bookings, one for unassigned), then count per date in JS.
 */
async function computePoolAvailabilityForDates(
	allTypeIds: string[],
	roomIds: string[],
	totalRooms: number,
	dates: string[]
): Promise<Map<string, number>> {
	if (dates.length === 0) return new Map();
	const minDate = dates[0];
	const maxDate = dates[dates.length - 1];

	type StayRow = { checkInDate: string; checkOutDate: string };

	const assignedBookings: StayRow[] =
		roomIds.length > 0
			? await db
					.select({ checkInDate: bookings.checkInDate, checkOutDate: bookings.checkOutDate })
					.from(bookings)
					.where(
						and(
							inArray(bookings.roomId, roomIds),
							ne(bookings.status, 'cancelled'),
							ne(bookings.status, 'blocked'),
							ne(bookings.status, 'checked_out'),
							lt(bookings.checkInDate, addDays(maxDate, 1)),
							gt(bookings.checkOutDate, minDate)
						)
					)
			: [];

	const unassignedBookings: StayRow[] =
		allTypeIds.length > 0
			? await db
					.select({ checkInDate: bookings.checkInDate, checkOutDate: bookings.checkOutDate })
					.from(bookings)
					.where(
						and(
							isNull(bookings.roomId),
							inArray(bookings.requestedRoomTypeId, allTypeIds),
							ne(bookings.status, 'cancelled'),
							ne(bookings.status, 'blocked'),
							lt(bookings.checkInDate, addDays(maxDate, 1)),
							gt(bookings.checkOutDate, minDate)
						)
					)
			: [];

	const result = new Map<string, number>();
	for (const date of dates) {
		const assigned = assignedBookings.filter(
			(b) => b.checkInDate <= date && b.checkOutDate > date
		).length;
		const unassigned = unassignedBookings.filter(
			(b) => b.checkInDate <= date && b.checkOutDate > date
		).length;
		result.set(date, Math.max(0, totalRooms - assigned - unassigned));
	}
	return result;
}

// ─── Rate helpers ─────────────────────────────────────────────────────────────

function getRateForDate(
	seasons: Array<{
		startDate: string;
		endDate: string;
		minNights: number;
		tiers: Array<{ roomTypeId: string; nightlyRate: number }>;
	}>,
	roomTypeId: string,
	date: string,
	defaultRateCents?: number | null
): { rate: number | null; minNights: number } {
	// Most specific (shortest) season wins
	const matching = seasons
		.filter((s) => s.startDate <= date && s.endDate >= date)
		.sort((a, b) => rangeDays(a) - rangeDays(b));

	for (const s of matching) {
		const tier = s.tiers.find((t) => t.roomTypeId === roomTypeId);
		if (tier) return { rate: tier.nightlyRate, minNights: s.minNights };
	}
	return { rate: defaultRateCents ?? null, minNights: 1 };
}

function rangeDays(s: { startDate: string; endDate: string }): number {
	return Math.round(
		(new Date(s.endDate + 'T12:00:00').getTime() -
			new Date(s.startDate + 'T12:00:00').getTime()) /
			86400000
	);
}

function addDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}
