/**
 * GET /api/public/rate-calendar
 *
 * Returns per-day pricing data for a month to power the booking calendar widget.
 *
 * Params:
 *   propertyId  – required
 *   year        – YYYY (required)
 *   month       – 1–12 (required)
 *   roomTypeId  – optional; if omitted returns lowest rate across all types
 */
import { json, error } from '@sveltejs/kit';
import { and, eq, lte, gte, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { roomTypes, rateSeasons, rateTiers, rateOverrides } from '$lib/server/db/schema';

export type CalendarDay = {
	date: string;          // YYYY-MM-DD
	lowestRateCents: number | null;
	stopSell: boolean;
	closedToArrival: boolean;
	closedToDeparture: boolean;
	minNights: number;
};

export const GET: RequestHandler = async ({ url }) => {
	const propertyId = url.searchParams.get('propertyId');
	const yearStr    = url.searchParams.get('year');
	const monthStr   = url.searchParams.get('month');
	const roomTypeId = url.searchParams.get('roomTypeId') || null;

	if (!propertyId || !yearStr || !monthStr) throw error(400, 'Missing params');

	const year  = parseInt(yearStr);
	const month = parseInt(monthStr); // 1-based
	if (isNaN(year) || isNaN(month) || month < 1 || month > 12) throw error(400, 'Invalid year/month');

	// Date range for this month
	const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
	const lastDay  = new Date(year, month, 0).toISOString().slice(0, 10); // last day of month

	// Get relevant room types
	const propRoomTypes = await db.query.roomTypes.findMany({
		where: and(
			eq(roomTypes.propertyId, propertyId),
			roomTypeId ? eq(roomTypes.id, roomTypeId) : undefined
		),
		columns: { id: true }
	});
	const typeIds = propRoomTypes.map((rt) => rt.id);
	if (typeIds.length === 0) return json([]);

	// Get seasons overlapping this month (non-manual-only)
	const seasons = await db.query.rateSeasons.findMany({
		where: and(
			eq(rateSeasons.propertyId, propertyId),
			lte(rateSeasons.startDate, lastDay),
			gte(rateSeasons.endDate, firstDay),
			eq(rateSeasons.isManualOnly, false)
		),
		with: {
			tiers: {
				where: inArray(rateTiers.roomTypeId, typeIds),
				columns: { roomTypeId: true, nightlyRate: true }
			}
		}
	});

	// Get per-date overrides for this month
	const overrides = await db.query.rateOverrides.findMany({
		where: and(
			inArray(rateOverrides.roomTypeId, typeIds),
			gte(rateOverrides.date, firstDay),
			lte(rateOverrides.date, lastDay)
		),
		columns: { roomTypeId: true, date: true, rateCents: true, stopSell: true, closedToArrival: true, closedToDeparture: true, minNights: true }
	});
	// Index: date → list of overrides
	const overridesByDate = new Map<string, typeof overrides>();
	for (const o of overrides) {
		const arr = overridesByDate.get(o.date) ?? [];
		arr.push(o);
		overridesByDate.set(o.date, arr);
	}

	const daysInMonth = new Date(year, month, 0).getDate();
	const result: CalendarDay[] = [];

	for (let d = 1; d <= daysInMonth; d++) {
		const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const dayOverrides = overridesByDate.get(date) ?? [];

		// A date is stop-sold only if ALL relevant types have stop_sell = true
		const stoppedTypes = new Set(dayOverrides.filter((o) => o.stopSell).map((o) => o.roomTypeId));
		const stopSell     = typeIds.length > 0 && typeIds.every((id) => stoppedTypes.has(id));

		// CTA/CTD: restricted if ANY active type has the flag
		const ctaTypes = new Set(dayOverrides.filter((o) => o.closedToArrival).map((o) => o.roomTypeId));
		const ctdTypes = new Set(dayOverrides.filter((o) => o.closedToDeparture).map((o) => o.roomTypeId));
		const closedToArrival   = typeIds.length > 0 && typeIds.every((id) => ctaTypes.has(id));
		const closedToDeparture = typeIds.length > 0 && typeIds.every((id) => ctdTypes.has(id));

		// Lowest rate across all types: prefer override, fall back to season tier
		let lowestRateCents: number | null = null;
		let minNights = 1;

		for (const tid of typeIds) {
			const typeOverride = dayOverrides.find((o) => o.roomTypeId === tid);
			if (typeOverride?.stopSell) continue; // this specific type is stopped

			if (typeOverride?.rateCents != null) {
				if (lowestRateCents === null || typeOverride.rateCents < lowestRateCents) {
					lowestRateCents = typeOverride.rateCents;
				}
			} else {
				// Find the season covering this date and get the tier rate
				const season = seasons.find((s) => s.startDate <= date && s.endDate >= date);
				const tier   = season?.tiers.find((t) => t.roomTypeId === tid);
				if (tier) {
					if (lowestRateCents === null || tier.nightlyRate < lowestRateCents) {
						lowestRateCents = tier.nightlyRate;
					}
				}
			}

			// minNights: take the maximum (most restrictive) across dates/seasons
			const dayMin = typeOverride?.minNights
				?? seasons.find((s) => s.startDate <= date && s.endDate >= date)?.minNights
				?? 1;
			if (dayMin > minNights) minNights = dayMin;
		}

		result.push({ date, lowestRateCents, stopSell, closedToArrival, closedToDeparture, minNights });
	}

	return json(result);
};
