import { redirect } from '@sveltejs/kit';
import { and, gte, lte, inArray, ne, isNull, eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { bookings, rateOverrides, rateSeasons, rooms, roomTypes, properties, bookingChannels } from '$lib/server/db/schema';
import { user } from '$lib/server/db/schema';
import { pushARI } from '$lib/server/channex';
import { fail } from '@sveltejs/kit';

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

export type PropAriData = {
	roomTypesList: {
		id: string; name: string; category: string; propertyId: string;
		channexRoomTypeId: string | null; channexRatePlanId: string | null;
	}[];
	ariData: Record<string, Record<string, ARICell>>;
};

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const today = isoDate(new Date());
	const from = url.searchParams.get('from') ?? today;
	const to = addDays(from, WINDOW - 1);
	const propId = url.searchParams.get('prop') ?? '';

	const propertiesList = await db.query.properties.findMany({
		orderBy: (t, { asc }) => [asc(t.name)]
	});

	const activePropId = propId || propertiesList[0]?.id || '';

	// Generate the date array (shared across all properties)
	const dates: string[] = [];
	let cur = from;
	while (cur <= to) { dates.push(cur); cur = addDays(cur, 1); }

	// ── Load all data across all properties in bulk ──────────────────────────

	const allPropIds = propertiesList.map((p) => p.id);

	const allRoomTypes = allPropIds.length ? await db.query.roomTypes.findMany({
		where: inArray(roomTypes.propertyId, allPropIds),
		orderBy: (t, { asc }) => [asc(t.sortOrder), asc(t.name)]
	}) : [];

	const allRoomTypeIds = allRoomTypes.map((rt) => rt.id);

	const allRooms = allRoomTypeIds.length ? await db.query.rooms.findMany({
		where: and(inArray(rooms.roomTypeId, allRoomTypeIds), eq(rooms.isActive, true)),
		columns: { id: true, roomTypeId: true }
	}) : [];

	const allRoomIds = allRooms.map((r) => r.id);

	// Assigned bookings (roomId set) — exclude terminal statuses to match ari-sync.ts logic
	const allActiveBookings = allRoomIds.length ? await db.query.bookings.findMany({
		where: and(
			inArray(bookings.roomId, allRoomIds),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
			ne(bookings.status, 'checked_out'),
			lte(bookings.checkInDate, to),
			gte(bookings.checkOutDate, from)
		),
		columns: { id: true, roomId: true, checkInDate: true, checkOutDate: true }
	}) : [];

	// Unassigned bookings (roomId null, requestedRoomTypeId set) also hold inventory
	const allUnassignedBookings = allRoomTypeIds.length ? await db.query.bookings.findMany({
		where: and(
			isNull(bookings.roomId),
			inArray(bookings.requestedRoomTypeId, allRoomTypeIds),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
			lte(bookings.checkInDate, to),
			gte(bookings.checkOutDate, from)
		),
		columns: { id: true, requestedRoomTypeId: true, checkInDate: true, checkOutDate: true }
	}) : [];

	const allSeasons = allRoomTypeIds.length ? await db.query.rateSeasons.findMany({
		where: and(
			inArray(rateSeasons.propertyId, allPropIds),
			lte(rateSeasons.startDate, to),
			gte(rateSeasons.endDate, from)
		),
		with: { tiers: true }
	}) : [];

	const allOverrides = allRoomTypeIds.length ? await db.query.rateOverrides.findMany({
		where: and(
			inArray(rateOverrides.roomTypeId, allRoomTypeIds),
			gte(rateOverrides.date, from),
			lte(rateOverrides.date, to)
		)
	}) : [];

	// Build lookup maps
	const roomCountByType: Record<string, number> = {};
	const roomIdsByType: Record<string, string[]> = {};
	for (const r of allRooms) {
		if (!r.roomTypeId) continue;
		roomCountByType[r.roomTypeId] = (roomCountByType[r.roomTypeId] ?? 0) + 1;
		roomIdsByType[r.roomTypeId] = [...(roomIdsByType[r.roomTypeId] ?? []), r.id];
	}

	const overrideMap: Record<string, Record<string, typeof allOverrides[0]>> = {};
	for (const ov of allOverrides) {
		overrideMap[ov.roomTypeId] ??= {};
		overrideMap[ov.roomTypeId][ov.date] = ov;
	}

	// ── Compute ARI per property ─────────────────────────────────────────────

	const propData: Record<string, PropAriData> = {};

	for (const prop of propertiesList) {
		const propRoomTypes = allRoomTypes.filter((rt) => rt.propertyId === prop.id);
		const propSeasons   = allSeasons.filter((s) => s.propertyId === prop.id);
		const ariData: Record<string, Record<string, ARICell>> = {};

		for (const rt of propRoomTypes) {
			ariData[rt.id] = {};
			const totalRooms = roomCountByType[rt.id] ?? 0;
			const rtRoomIds  = roomIdsByType[rt.id] ?? [];

			for (const date of dates) {
				const booked = allActiveBookings.filter(
					(b) => b.roomId !== null && rtRoomIds.includes(b.roomId) &&
					       b.checkInDate <= date && b.checkOutDate > date
				).length;
				const unassigned = allUnassignedBookings.filter(
					(b) => b.requestedRoomTypeId === rt.id &&
					       b.checkInDate <= date && b.checkOutDate > date
				).length;
				const available = Math.max(0, totalRooms - booked - unassigned);

				let baseRateCents: number | null = null;
				let baseMinNights = 1;
				let seasonColour: string | null = null;
				for (const s of propSeasons) {
					if (s.startDate <= date && s.endDate >= date) {
						const tier = s.tiers.find((t) => t.roomTypeId === rt.id);
						if (tier) {
							baseRateCents = tier.nightlyRate;
							baseMinNights = s.minNights;
							seasonColour  = s.colour;
							break;
						}
					}
				}

				const ov = overrideMap[rt.id]?.[date];
				const overrideRateCents   = ov?.rateCents ?? null;
				const effectiveRateCents  = overrideRateCents ?? baseRateCents;
				const minNights           = ov?.minNights ?? baseMinNights;
				const stopSell            = ov?.stopSell ?? false;
				const closedToArrival     = ov?.closedToArrival ?? false;
				const closedToDeparture   = ov?.closedToDeparture ?? false;
				const hasOverride = !!ov && (
					ov.rateCents != null || ov.minNights != null ||
					ov.stopSell || ov.closedToArrival || ov.closedToDeparture
				);

				ariData[rt.id][date] = {
					available, totalRooms, baseRateCents, overrideRateCents, effectiveRateCents,
					baseMinNights, minNights, stopSell, closedToArrival, closedToDeparture,
					hasOverride, seasonColour
				};
			}
		}

		propData[prop.id] = { roomTypesList: propRoomTypes, ariData };
	}

	return {
		propertiesList,
		activePropId,
		dates,
		from,
		to,
		today,
		window: WINDOW,
		propData,
		channels: await db.query.bookingChannels.findMany({
			where: eq(bookingChannels.isActive, true),
			orderBy: (t, { asc }) => [asc(t.sortOrder)]
		}),
		users: await db.select({ id: user.id, name: user.name }).from(user).orderBy(user.name),
		currentUserId: locals.user?.id ?? ''
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
