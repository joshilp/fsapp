import { redirect } from '@sveltejs/kit';
import { and, gte, lte, inArray, or, eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { bookings, rateOverrides, rateSeasons, rateTiers, rooms, roomTypes, properties } from '$lib/server/db/schema';
import { pushARI } from '$lib/server/channex';
import { fail } from '@sveltejs/kit';

// How many days to show at once
const WINDOW = 60;

function isoDate(d: Date) {
	return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number) {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return isoDate(d);
}

export type ARICell = {
	available: number;
	totalRooms: number;
	baseRateCents: number | null;
	overrideRateCents: number | null;
	effectiveRateCents: number | null;
	baseMinNights: number;
	minNights: number;
	stopSell: boolean;
	closedToArrival: boolean;
	closedToDeparture: boolean;
	hasOverride: boolean;
	seasonColour: string | null;
};

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const today = isoDate(new Date());

	// Date window
	const from = url.searchParams.get('from') ?? today;
	const to = addDays(from, WINDOW - 1);
	const propId = url.searchParams.get('prop') ?? '';

	// Load all properties
	const propertiesList = await db.query.properties.findMany({
		orderBy: (t, { asc }) => [asc(t.name)]
	});

	const activePropId = propId || propertiesList[0]?.id || '';

	// Room types for this property (ordered)
	const roomTypesList = await db.query.roomTypes.findMany({
		where: eq(roomTypes.propertyId, activePropId),
		orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.name)]
	});

	const roomTypeIds = roomTypesList.map((rt) => rt.id);

	// Count active rooms per room type
	const roomList = roomTypeIds.length
		? await db.query.rooms.findMany({
				where: and(
					inArray(rooms.roomTypeId, roomTypeIds),
					eq(rooms.isActive, true)
				),
				columns: { id: true, roomTypeId: true }
			})
		: [];

	const roomCountByType: Record<string, number> = {};
	const roomIdsByType: Record<string, string[]> = {};
	for (const r of roomList) {
		if (!r.roomTypeId) continue;
		roomCountByType[r.roomTypeId] = (roomCountByType[r.roomTypeId] ?? 0) + 1;
		roomIdsByType[r.roomTypeId] = [...(roomIdsByType[r.roomTypeId] ?? []), r.id];
	}

	// All room IDs for this property
	const allRoomIds = roomList.map((r) => r.id);

	// Active bookings in the date range (confirmed + checked_in)
	const activeBookings = allRoomIds.length
		? await db.query.bookings.findMany({
				where: and(
					inArray(bookings.roomId, allRoomIds),
					or(eq(bookings.status, 'confirmed'), eq(bookings.status, 'checked_in')),
					// booking overlaps window: checkIn < to+1 AND checkOut > from
					lte(bookings.checkInDate, to),
					gte(bookings.checkOutDate, from)
				),
				columns: { id: true, roomId: true, checkInDate: true, checkOutDate: true }
			})
		: [];

	// Rate seasons for this property
	const seasonList = roomTypeIds.length
		? await db.query.rateSeasons.findMany({
				where: and(
					eq(rateSeasons.propertyId, activePropId),
					lte(rateSeasons.startDate, to),
					gte(rateSeasons.endDate, from)
				),
				with: { tiers: true }
			})
		: [];

	// Rate overrides in the range
	const overrideList = roomTypeIds.length
		? await db.query.rateOverrides.findMany({
				where: and(
					inArray(rateOverrides.roomTypeId, roomTypeIds),
					gte(rateOverrides.date, from),
					lte(rateOverrides.date, to)
				)
			})
		: [];

	// Build override map: roomTypeId → date → override
	const overrideMap: Record<string, Record<string, typeof overrideList[0]>> = {};
	for (const ov of overrideList) {
		overrideMap[ov.roomTypeId] ??= {};
		overrideMap[ov.roomTypeId][ov.date] = ov;
	}

	// Generate the date array
	const dates: string[] = [];
	let cur = from;
	while (cur <= to) {
		dates.push(cur);
		cur = addDays(cur, 1);
	}

	// Build ARI data: roomTypeId → date → ARICell
	const ariData: Record<string, Record<string, ARICell>> = {};

	for (const rt of roomTypesList) {
		ariData[rt.id] = {};
		const totalRooms = roomCountByType[rt.id] ?? 0;
		const rtRoomIds = roomIdsByType[rt.id] ?? [];

		for (const date of dates) {
			// Count bookings occupying this room type on this date
			const booked = activeBookings.filter(
				(b) =>
					b.roomId !== null &&
					rtRoomIds.includes(b.roomId) &&
					b.checkInDate <= date &&
					b.checkOutDate > date
			).length;
			const available = Math.max(0, totalRooms - booked);

			// Find applicable season for this date
			let baseRateCents: number | null = null;
			let baseMinNights = 1;
			let seasonColour: string | null = null;
			for (const s of seasonList) {
				if (s.startDate <= date && s.endDate >= date) {
					const tier = s.tiers.find((t) => t.roomTypeId === rt.id);
					if (tier) {
						baseRateCents = tier.nightlyRate;
						baseMinNights = s.minNights;
						seasonColour = s.colour;
						break;
					}
				}
			}

			const ov = overrideMap[rt.id]?.[date];
			const overrideRateCents = ov?.rateCents ?? null;
			const effectiveRateCents = overrideRateCents ?? baseRateCents;
			const minNights = ov?.minNights ?? baseMinNights;
			const stopSell = ov?.stopSell ?? false;
			const closedToArrival = ov?.closedToArrival ?? false;
			const closedToDeparture = ov?.closedToDeparture ?? false;
			const hasOverride = !!ov && (
				ov.rateCents != null || ov.minNights != null ||
				ov.stopSell || ov.closedToArrival || ov.closedToDeparture
			);

			ariData[rt.id][date] = {
				available,
				totalRooms,
				baseRateCents,
				overrideRateCents,
				effectiveRateCents,
				baseMinNights,
				minNights,
				stopSell,
				closedToArrival,
				closedToDeparture,
				hasOverride,
				seasonColour
			};
		}
	}

	return {
		propertiesList,
		activePropId,
		roomTypesList,
		ariData,
		dates,
		from,
		to,
		today,
		window: WINDOW
	};
};

// ── Bulk Channex sync action ──────────────────────────────────────────────────
export const actions: Actions = {
	syncChannex: async ({ url, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const propId = url.searchParams.get('prop') ?? '';
		if (!propId) return fail(400, { error: 'Missing prop' });

		const prop = await db.query.properties.findFirst({
			where: eq(properties.id, propId)
		});
		if (!prop?.channexPropertyId) {
			return fail(400, { error: 'Property has no Channex ID configured. Add it in Settings → Channels.' });
		}

		const today = isoDate(new Date());
		const to = addDays(today, WINDOW - 1);

		const rtList = await db.query.roomTypes.findMany({
			where: eq(roomTypes.propertyId, propId)
		});

		const updates: Parameters<typeof pushARI>[0] = [];

		for (const rt of rtList) {
			if (!rt.channexRoomTypeId || !rt.channexRatePlanId) continue;

			// Build one entry per season (date range) for efficiency
			const seasonList = await db.query.rateSeasons.findMany({
				where: and(eq(rateSeasons.propertyId, propId), lte(rateSeasons.startDate, to), gte(rateSeasons.endDate, today)),
				with: { tiers: true }
			});

			const roomIds = (await db.query.rooms.findMany({
				where: and(eq(rooms.roomTypeId, rt.id), eq(rooms.isActive, true)),
				columns: { id: true }
			})).map((r) => r.id);

			const totalRooms = roomIds.length;

			for (const s of seasonList) {
				const tier = s.tiers.find((t) => t.roomTypeId === rt.id);
				if (!tier) continue;
				updates.push({
					channexPropertyId: prop.channexPropertyId!,
					channexRoomTypeId: rt.channexRoomTypeId!,
					channexRatePlanId: rt.channexRatePlanId!,
					dateFrom: s.startDate < today ? today : s.startDate,
					dateTo: s.endDate > to ? to : s.endDate,
					availability: totalRooms,
					rateCents: tier.nightlyRate,
					minNights: s.minNights
				});
			}
		}

		if (updates.length === 0) {
			return { synced: false, message: 'No seasons or Channex IDs configured for this property.' };
		}

		const ok = await pushARI(updates);
		return { synced: ok, message: ok ? `Pushed ${updates.length} ARI ranges to Channex.` : 'Channex push failed — check your API key and IDs.' };
	}
};
