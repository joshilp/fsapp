import { json, error } from '@sveltejs/kit';
import { and, eq, lte, gte, isNull, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { losDiscounts, promoCodes, rateSeasons, rateTiers, roomTypes } from '$lib/server/db/schema';

export type PublicRateLine = {
	seasonName: string;
	colour: string;
	nights: number;
	unitCents: number;
	totalCents: number;
};

export type PublicPromoResult = {
	id: string;
	code: string;
	label: string;
	discountPercent: number | null;
	discountCents: number | null;
} | null;

export type PublicLosDiscount = {
	id: string;
	label: string;
	discountPercent: number;
} | null;

export type PublicPricing = {
	lines: PublicRateLine[];
	subtotalCents: number;
	nightsTotal: number;
	minNightWarning: string | null;
	// Applied automatic LOS discount
	losDiscount: PublicLosDiscount;
	losDiscountCents: number;
	// Applied promo code
	promo: PublicPromoResult;
	promoDiscountCents: number;
	// Final total after discounts (before property tax)
	totalAfterDiscountsCents: number;
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
	const promoCode  = url.searchParams.get('promo')?.trim().toUpperCase() || null;

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

	// Min-night warning
	let minNightWarning: string | null = null;
	for (const n of perNight) {
		const line = lines.find((l) => l.seasonName === n.seasonName);
		if (n.minNights > 1 && line && line.nights < n.minNights) {
			minNightWarning = `"${n.seasonName}" requires a ${n.minNights}-night minimum.`;
			break;
		}
	}

	// ── LOS discount ─────────────────────────────────────────────────────────
	// Find the best (highest discount) applicable LOS rule
	const allLos = await db.query.losDiscounts.findMany({
		where: and(
			eq(losDiscounts.propertyId, rt.propertyId),
			eq(losDiscounts.isActive, true),
			or(isNull(losDiscounts.roomTypeId), eq(losDiscounts.roomTypeId, roomTypeId))
		),
		orderBy: (l, { asc }) => [asc(l.minNights)]
	});
	const applicableLos = allLos
		.filter((l) => nightsTotal >= l.minNights)
		.sort((a, b) => b.discountPercent - a.discountPercent)[0] ?? null;

	const losDiscountCents = applicableLos
		? Math.round(subtotalCents * (applicableLos.discountPercent / 100))
		: 0;

	const losDiscount: PublicLosDiscount = applicableLos
		? { id: applicableLos.id, label: applicableLos.label, discountPercent: applicableLos.discountPercent }
		: null;

	// ── Promo code ────────────────────────────────────────────────────────────
	let promo: PublicPromoResult = null;
	let promoDiscountCents = 0;

	if (promoCode) {
		const now = new Date();
		const found = await db.query.promoCodes.findFirst({
			where: and(
				eq(promoCodes.propertyId, rt.propertyId),
				eq(promoCodes.code, promoCode),
				eq(promoCodes.isActive, true)
			)
		});
		if (found) {
			const expired = found.expiresAt && found.expiresAt < now;
			const exhausted = found.maxUses !== null && found.usedCount >= found.maxUses;
			if (!expired && !exhausted) {
				const baseForPromo = subtotalCents - losDiscountCents;
				promoDiscountCents = found.discountPercent
					? Math.round(baseForPromo * (found.discountPercent / 100))
					: (found.discountCents ?? 0);
				promo = {
					id: found.id,
					code: found.code,
					label: found.label,
					discountPercent: found.discountPercent ?? null,
					discountCents: found.discountCents ?? null
				};
			}
		}
	}

	const totalAfterDiscountsCents = Math.max(0, subtotalCents - losDiscountCents - promoDiscountCents);

	return json({
		lines,
		subtotalCents,
		nightsTotal,
		minNightWarning,
		losDiscount,
		losDiscountCents,
		promo,
		promoDiscountCents,
		totalAfterDiscountsCents
	} satisfies PublicPricing);
};
