import { json, error } from '@sveltejs/kit';
import { and, eq, lte, gte } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { rateSeasons, rateTiers, roomTypes } from '$lib/server/db/schema';

export type PublicRateLine = {
	seasonName: string;
	colour: string;
	nights: number;
	unitCents: number;
	totalCents: number;
};

export type PublicPricing = {
	lines: PublicRateLine[];
	subtotalCents: number;
	nightsTotal: number;
	minNightWarning: string | null;
};

function addDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

export const GET: RequestHandler = async ({ url }) => {
	const roomTypeId = url.searchParams.get('roomTypeId');
	const checkIn    = url.searchParams.get('checkIn');
	const checkOut   = url.searchParams.get('checkOut');

	if (!roomTypeId || !checkIn || !checkOut || checkIn >= checkOut) {
		throw error(400, 'Missing or invalid params');
	}

	const rt = await db.query.roomTypes.findFirst({
		where: eq(roomTypes.id, roomTypeId),
		columns: { id: true, propertyId: true }
	});
	if (!rt) throw error(404, 'Room type not found');

	const seasons = await db.query.rateSeasons.findMany({
		where: and(
			eq(rateSeasons.propertyId, rt.propertyId),
			lte(rateSeasons.startDate, checkOut),
			gte(rateSeasons.endDate, checkIn)
		),
		with: { tiers: { where: eq(rateTiers.roomTypeId, roomTypeId) } },
		orderBy: (s, { asc }) => [asc(s.startDate)]
	});

	const nightsTotal = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);

	type PerNight = { seasonId: string; seasonName: string; colour: string; rate: number; minNights: number };
	const perNight: PerNight[] = [];

	for (let i = 0; i < nightsTotal; i++) {
		const night = addDays(checkIn, i);
		const season = seasons.find((s) => s.startDate <= night && s.endDate >= night);
		if (!season) {
			perNight.push({ seasonId: '', seasonName: '(no rate)', colour: '#cccccc', rate: 0, minNights: 1 });
			continue;
		}
		perNight.push({
			seasonId:   season.id,
			seasonName: season.name,
			colour:     season.colour,
			rate:       season.tiers?.[0]?.nightlyRate ?? 0,
			minNights:  season.minNights
		});
	}

	// Group consecutive nights with same season into line items
	const lines: PublicRateLine[] = [];
	let i = 0;
	while (i < perNight.length) {
		const cur = perNight[i];
		let count = 1;
		while (i + count < perNight.length && perNight[i + count].seasonId === cur.seasonId) count++;
		lines.push({ seasonName: cur.seasonName, colour: cur.colour, nights: count, unitCents: cur.rate, totalCents: cur.rate * count });
		i += count;
	}

	const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);

	// Warn if any season requires more nights than are booked in that period
	let minNightWarning: string | null = null;
	for (const n of perNight) {
		const line = lines.find((l) => l.seasonName === n.seasonName);
		if (n.minNights > 1 && line && line.nights < n.minNights) {
			minNightWarning = `"${n.seasonName}" requires a ${n.minNights}-night minimum.`;
			break;
		}
	}

	return json({ lines, subtotalCents, nightsTotal, minNightWarning } satisfies PublicPricing);
};
