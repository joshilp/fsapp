import { json } from '@sveltejs/kit';
import { and, eq, lte, gte } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { properties, rateSeasons, rateTiers, rooms } from '$lib/server/db/schema';

export type RateLine = {
	seasonId: string;
	seasonName: string;
	colour: string;
	nights: number;
	unitCents: number;
	totalCents: number;
	minNights: number;
};

export type PricingSuggestion = {
	lines: RateLine[];
	subtotalCents: number;
	/** Suggested deposit based on property policy */
	suggestedDepositCents: number;
	/** Nights in a season that requires more nights than booked */
	minNightWarning: string | null;
	nightsTotal: number;
};

function addDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
	return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const roomId = url.searchParams.get('roomId');
	const checkIn = url.searchParams.get('checkIn');
	const checkOut = url.searchParams.get('checkOut');

	if (!roomId || !checkIn || !checkOut || checkIn >= checkOut) {
		return json({ error: 'Missing or invalid params' }, { status: 400 });
	}

	// Look up room → propertyId + roomTypeId
	const room = await db.query.rooms.findFirst({
		where: eq(rooms.id, roomId),
		columns: { id: true, propertyId: true, roomTypeId: true }
	});
	if (!room) return json({ error: 'Room not found' }, { status: 404 });

	// Load property for deposit policy
	const property = await db.query.properties.findFirst({
		where: eq(properties.id, room.propertyId),
		columns: {
			depositCalcMethod: true,
			depositNights: true,
			depositPercent: true,
			depositFlatCents: true
		}
	});

	// Load all rate seasons for this property that overlap the stay
	const seasons = await db.query.rateSeasons.findMany({
		where: and(
			eq(rateSeasons.propertyId, room.propertyId),
			lte(rateSeasons.startDate, checkOut),
			gte(rateSeasons.endDate, checkIn)
		),
		with: {
			tiers: room.roomTypeId
				? { where: eq(rateTiers.roomTypeId, room.roomTypeId) }
				: undefined
		},
		orderBy: (t, { asc }) => [asc(t.startDate)]
	});

	// Walk each night of the stay and find the applicable season
	const nightsTotal = daysBetween(checkIn, checkOut);
	const perNight: Array<{ seasonId: string; seasonName: string; colour: string; rate: number; minNights: number }> = [];

	for (let i = 0; i < nightsTotal; i++) {
		const night = addDays(checkIn, i);
		const season = seasons.find((s) => s.startDate <= night && s.endDate >= night);
		if (!season) {
			perNight.push({ seasonId: '', seasonName: '(no rate)', colour: '#cccccc', rate: 0, minNights: 1 });
			continue;
		}
		const tier = season.tiers?.[0];
		perNight.push({
			seasonId: season.id,
			seasonName: season.name,
			colour: season.colour,
			rate: tier?.nightlyRate ?? 0,
			minNights: season.minNights
		});
	}

	// Group consecutive nights with same rate into line items
	const lines: RateLine[] = [];
	let i = 0;
	while (i < perNight.length) {
		const cur = perNight[i];
		let count = 1;
		while (i + count < perNight.length && perNight[i + count].seasonId === cur.seasonId) {
			count++;
		}
		lines.push({
			seasonId: cur.seasonId,
			seasonName: cur.seasonName,
			colour: cur.colour,
			nights: count,
			unitCents: cur.rate,
			totalCents: cur.rate * count,
			minNights: cur.minNights
		});
		i += count;
	}

	const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);

	// ── Calculate suggested deposit based on property policy ─────────────────
	const method = property?.depositCalcMethod ?? 'first_night';
	const depNights = property?.depositNights ?? 1;
	let suggestedDepositCents = 0;
	if (method === 'flat') {
		suggestedDepositCents = property?.depositFlatCents ?? 0;
	} else if (method === 'percentage') {
		suggestedDepositCents = Math.round(subtotalCents * (property?.depositPercent ?? 20) / 100);
	} else if (method === 'average') {
		const avgNight = nightsTotal > 0 ? subtotalCents / nightsTotal : 0;
		suggestedDepositCents = Math.round(avgNight * depNights);
	} else {
		// first_night (default): sum the first depNights nights of rate
		let counted = 0;
		for (const n of perNight) {
			if (counted >= depNights) break;
			suggestedDepositCents += n.rate;
			counted++;
		}
	}

	// Check if any season in this stay has a min-night requirement not met
	let minNightWarning: string | null = null;
	for (const line of lines) {
		if (line.minNights > 1 && line.nights < line.minNights) {
			minNightWarning = `"${line.seasonName}" requires a ${line.minNights}-night minimum (you have ${line.nights} night${line.nights === 1 ? '' : 's'} in this period).`;
			break;
		}
	}

	return json({ lines, subtotalCents, suggestedDepositCents, minNightWarning, nightsTotal } satisfies PricingSuggestion);
};
