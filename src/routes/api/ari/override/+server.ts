/**
 * POST /api/ari/override
 * Upsert a rate_override for a specific room type + date.
 * Body: { roomTypeId, date, rateCents?, minNights?, stopSell?, closedToArrival?, closedToDeparture? }
 * After saving, pushes updated ARI to Channex (non-blocking).
 *
 * DELETE /api/ari/override
 * Remove the override for a specific { roomTypeId, date }.
 */
import { json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rateOverrides, roomTypes, properties, rateSeasons, rateTiers, rooms, bookings } from '$lib/server/db/schema';
import { pushARI } from '$lib/server/channex';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json();
	const { roomTypeId, date, rateCents, minNights, stopSell, closedToArrival, closedToDeparture } = body as {
		roomTypeId: string;
		date: string;
		rateCents?: number | null;
		minNights?: number | null;
		stopSell?: boolean;
		closedToArrival?: boolean;
		closedToDeparture?: boolean;
	};

	if (!roomTypeId || !date) return json({ error: 'Missing roomTypeId or date' }, { status: 400 });

	// Upsert the override (SQLite doesn't have a nice upsert in Drizzle yet, so delete + insert)
	await db.delete(rateOverrides).where(
		and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, date))
	);

	// Only insert if there's something meaningful to override
	const hasContent = rateCents != null || minNights != null || stopSell || closedToArrival || closedToDeparture;
	if (hasContent) {
		await db.insert(rateOverrides).values({
			id: crypto.randomUUID(),
			roomTypeId,
			date,
			rateCents: rateCents ?? null,
			minNights: minNights ?? null,
			stopSell: stopSell ?? false,
			closedToArrival: closedToArrival ?? false,
			closedToDeparture: closedToDeparture ?? false,
			updatedAt: new Date()
		});
	}

	// Push to Channex in background (non-blocking — local save always succeeds)
	void pushARIForRoomType(roomTypeId, date, date).catch(() => {});

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const { roomTypeId, date } = await request.json() as { roomTypeId: string; date: string };
	if (!roomTypeId || !date) return json({ error: 'Missing params' }, { status: 400 });

	await db.delete(rateOverrides).where(
		and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, date))
	);

	void pushARIForRoomType(roomTypeId, date, date).catch(() => {});
	return json({ ok: true });
};

/** Compute current availability + rate for a date range and push to Channex */
async function pushARIForRoomType(roomTypeId: string, dateFrom: string, dateTo: string) {
	const rt = await db.query.roomTypes.findFirst({
		where: eq(roomTypes.id, roomTypeId),
		with: { property: true }
	});
	if (!rt?.channexRoomTypeId || !rt?.channexRatePlanId || !rt.property?.channexPropertyId) return;

	// Count active rooms of this type
	const roomList = await db.query.rooms.findMany({
		where: and(eq(rooms.roomTypeId, roomTypeId), eq(rooms.isActive, true)),
		columns: { id: true }
	});
	const totalRooms = roomList.length;
	const roomIds = roomList.map((r) => r.id);

	// Get override for this date
	const override = await db.query.rateOverrides.findFirst({
		where: and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, dateFrom))
	});

	// Count bookings covering this date
	const activeBookings = await db.query.bookings.findMany({
		where: and(
			eq(bookings.status, 'confirmed')
		),
		columns: { id: true, roomId: true, checkInDate: true, checkOutDate: true, status: true }
	});
	const booked = activeBookings.filter(
		(b) =>
			(b.status === 'confirmed' || b.status === 'checked_in') &&
			b.roomId &&
			roomIds.includes(b.roomId) &&
			b.checkInDate <= dateFrom &&
			b.checkOutDate > dateFrom
	).length;
	const availability = Math.max(0, totalRooms - booked);

	// Get base rate from season
	const seasons = await db.query.rateSeasons.findMany({
		where: eq(rateSeasons.propertyId, rt.propertyId),
		with: { tiers: true }
	});
	let baseRate: number | null = null;
	let baseMinNights = 1;
	for (const s of seasons) {
		if (s.startDate <= dateFrom && s.endDate >= dateFrom) {
			const tier = s.tiers.find((t) => t.roomTypeId === roomTypeId);
			if (tier) { baseRate = tier.nightlyRate; baseMinNights = s.minNights; break; }
		}
	}

	const effectiveRate = override?.rateCents ?? baseRate;
	const effectiveMin = override?.minNights ?? baseMinNights;

	if (!effectiveRate) return; // no rate configured, skip push

	await pushARI([{
		channexPropertyId: rt.property.channexPropertyId!,
		channexRoomTypeId: rt.channexRoomTypeId!,
		channexRatePlanId: rt.channexRatePlanId!,
		dateFrom,
		dateTo,
		availability,
		rateCents: effectiveRate,
		minNights: effectiveMin,
		stopSell: override?.stopSell ?? false,
		closedToArrival: override?.closedToArrival ?? false,
		closedToDeparture: override?.closedToDeparture ?? false
	}]);
}
