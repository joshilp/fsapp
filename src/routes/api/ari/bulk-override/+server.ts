import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { rateOverrides, rateSeasons, rateTiers, roomTypes } from '$lib/server/db/schema';
import { syncARIForDate } from '$lib/server/ari-sync';
import type { RequestHandler } from './$types';

interface BulkOverrideBody {
	roomTypeId?: string;
	propertyId?: string;
	dates: string[];
	rateMode: 'none' | 'set' | 'increase_pct';
	rateValue?: number | null;
	minNights?: number | null;
	availabilityOverride?: number | null; // null = clear override, -1 = no change
	stopSell?: boolean | null;
	closedToArrival?: boolean | null;
	closedToDeparture?: boolean | null;
}

/** Get the base season rate (cents) for a room type on a given date. */
async function getSeasonRate(roomTypeId: string, date: string): Promise<number | null> {
	const rt = await db.query.roomTypes.findFirst({
		where: eq(roomTypes.id, roomTypeId),
		columns: { propertyId: true }
	});
	if (!rt) return null;

	const seasons = await db.query.rateSeasons.findMany({
		where: eq(rateSeasons.propertyId, rt.propertyId),
		with: { tiers: { where: eq(rateTiers.roomTypeId, roomTypeId) } }
	});

	// Find the season covering this date
	for (const season of seasons) {
		if (season.startDate <= date && date < season.endDate && season.tiers.length > 0) {
			return season.tiers[0].nightlyRate;
		}
	}
	return null;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = (await request.json()) as BulkOverrideBody;
	const { dates, rateMode, rateValue, minNights, availabilityOverride, stopSell, closedToArrival, closedToDeparture } =
		body;

	if (!dates?.length) return json({ error: 'No dates provided' }, { status: 400 });
	if (!body.roomTypeId && !body.propertyId)
		return json({ error: 'roomTypeId or propertyId required' }, { status: 400 });

	// Resolve which room types to update
	let roomTypeIds: string[];
	if (body.roomTypeId) {
		roomTypeIds = [body.roomTypeId];
	} else {
		const rts = await db.query.roomTypes.findMany({
			where: eq(roomTypes.propertyId, body.propertyId!),
			columns: { id: true }
		});
		roomTypeIds = rts.map((r) => r.id);
	}

	let updated = 0;

	for (const roomTypeId of roomTypeIds) {
		for (const date of dates) {
			// Read existing override for merge semantics ("no change" preserves existing value)
			const existing = await db.query.rateOverrides.findFirst({
				where: and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, date))
			});

			const currentRate = existing?.rateCents ?? null;
			const currentMin = existing?.minNights ?? null;
			const currentAvailOverride = existing?.availabilityOverride ?? null;
			const currentStop = existing?.stopSell ?? false;
			const currentCTA = existing?.closedToArrival ?? false;
			const currentCTD = existing?.closedToDeparture ?? false;

			// Compute new rate
			let newRate = currentRate;
			if (rateMode === 'set' && rateValue != null) {
				newRate = Math.round(rateValue * 100);
			} else if (rateMode === 'increase_pct' && rateValue != null) {
				const base = currentRate ?? (await getSeasonRate(roomTypeId, date));
				if (base != null) newRate = Math.round(base * (1 + rateValue / 100));
			}

			// Apply field changes; undefined = no change sentinel, null = clear override
			const newMin = minNights !== undefined ? minNights : currentMin;
			// availabilityOverride: -1 = no change, null = clear, number = set
			const newAvailOverride = availabilityOverride === undefined || availabilityOverride === -1
				? currentAvailOverride
				: availabilityOverride;
			const newStop = stopSell != null ? stopSell : currentStop;
			const newCTA = closedToArrival != null ? closedToArrival : currentCTA;
			const newCTD = closedToDeparture != null ? closedToDeparture : currentCTD;

			// Delete existing (re-insert below, or leave deleted if nothing to store)
			if (existing) {
				await db.delete(rateOverrides).where(eq(rateOverrides.id, existing.id));
			}

			// Only insert if there's a non-default value to store
			const hasContent =
				newRate != null || (newMin != null && newMin > 1) ||
				newAvailOverride != null ||
				newStop || newCTA || newCTD;
			if (hasContent) {
				await db.insert(rateOverrides).values({
					id: crypto.randomUUID(),
					roomTypeId,
					date,
					rateCents: newRate,
					minNights: newMin,
					availabilityOverride: newAvailOverride,
					stopSell: newStop,
					closedToArrival: newCTA,
					closedToDeparture: newCTD,
					updatedAt: new Date()
				});
			}

			// Fire-and-forget ARI push
			void syncARIForDate(roomTypeId, date).catch((e) =>
				console.error('[ari-sync] bulk-override:', e)
			);
			updated++;
		}
	}

	return json({ updated });
};
