import { json, error } from '@sveltejs/kit';
import { and, eq, lte, gte, lt, isNull, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { losDiscounts, promoCodes, rateSeasons, rateTiers, roomTypes, rateOverrides } from '$lib/server/db/schema';
import { resolveNightlyRate } from '$lib/server/rates';

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
	// Extra guest surcharge
	extraGuestNights: number;
	extraGuestFeeCents: number;
	extraGuestTotalCents: number;
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
	const numGuests  = Math.max(1, parseInt(url.searchParams.get('numGuests') ?? '2') || 2);

	if (!roomTypeId || !checkIn || !checkOut || checkIn >= checkOut) {
		throw error(400, 'Missing or invalid params');
	}

	const rt = await db.query.roomTypes.findFirst({
		where: eq(roomTypes.id, roomTypeId),
		columns: { id: true, propertyId: true }
	});
	if (!rt) throw error(404, 'Room type not found');

	// Only non-manual-only seasons
	const seasons = await db.query.rateSeasons.findMany({
		where: and(
			eq(rateSeasons.propertyId, rt.propertyId),
			lte(rateSeasons.startDate, checkOut),
			gte(rateSeasons.endDate, checkIn),
			eq(rateSeasons.isManualOnly, false)
		),
		with: {
			tiers: {
				where: eq(rateTiers.roomTypeId, roomTypeId),
				columns: { nightlyRate: true, baseOccupancy: true, extraGuestFeeCents: true, dowRates: true }
			}
		},
		orderBy: (s, { asc }) => [asc(s.startDate)]
	});

	// Per-date rate overrides for this room type in the stay
	const nightsTotal = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	const overrides = await db.query.rateOverrides.findMany({
		where: and(
			eq(rateOverrides.roomTypeId, roomTypeId),
			gte(rateOverrides.date, checkIn),
			lt(rateOverrides.date, checkOut)
		),
		columns: { date: true, rateCents: true, minNights: true }
	});
	const overrideByDate = new Map(overrides.map((o) => [o.date, o]));

	type PerNight = {
		seasonId: string; seasonName: string; colour: string;
		rate: number; minNights: number;
		baseOccupancy: number; extraGuestFeeCents: number;
	};
	const perNight: PerNight[] = [];

	for (let i = 0; i < nightsTotal; i++) {
		const night    = addDays(checkIn, i);
		const override = overrideByDate.get(night);
		const season   = seasons.find((s) => s.startDate <= night && s.endDate >= night);
		const tier     = season?.tiers?.[0];

		const rate         = override?.rateCents ?? (tier ? resolveNightlyRate(tier.nightlyRate, tier.dowRates ?? null, night) : 0);
		const minNights    = override?.minNights ?? season?.minNights ?? 1;
		const baseOcc      = tier?.baseOccupancy ?? 2;
		const extraFee     = tier?.extraGuestFeeCents ?? 0;

		if (!season) {
			perNight.push({ seasonId: '', seasonName: '(no rate)', colour: '#cccccc', rate: 0, minNights: 1, baseOccupancy: 2, extraGuestFeeCents: 0 });
			continue;
		}
		perNight.push({
			seasonId:          season.id,
			seasonName:        season.name,
			colour:            season.colour,
			rate,
			minNights,
			baseOccupancy:     baseOcc,
			extraGuestFeeCents: extraFee
		});
	}

	// Group consecutive same-season nights into line items
	const lines: PublicRateLine[] = [];
	let i = 0;
	while (i < perNight.length) {
		const cur   = perNight[i];
		let count   = 1;
		while (i + count < perNight.length && perNight[i + count].seasonId === cur.seasonId) count++;
		lines.push({ seasonName: cur.seasonName, colour: cur.colour, nights: count, unitCents: cur.rate, totalCents: cur.rate * count });
		i += count;
	}

	const subtotalCents = lines.reduce((s, l) => s + l.totalCents, 0);

	// Min-night warning (season-level OR per-date override)
	let minNightWarning: string | null = null;
	for (const n of perNight) {
		if (n.minNights > 1 && nightsTotal < n.minNights) {
			minNightWarning = `"${n.seasonName}" requires a ${n.minNights}-night minimum.`;
			break;
		}
	}

	// ── Extra guest surcharge ─────────────────────────────────────────────────
	// Use the first season's tier settings (simplification — most stays will be in one season)
	const repNight = perNight.find((n) => n.seasonId !== '');
	const baseOccupancy   = repNight?.baseOccupancy ?? 2;
	const extraGuestFee   = repNight?.extraGuestFeeCents ?? 0;
	const extraGuestNights = extraGuestFee > 0 && numGuests > baseOccupancy ? nightsTotal : 0;
	const extraGuestsOver = Math.max(0, numGuests - baseOccupancy);
	const extraGuestTotalCents = extraGuestFee > 0 ? extraGuestsOver * extraGuestFee * extraGuestNights : 0;

	// ── LOS discount ─────────────────────────────────────────────────────────
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
		const now   = new Date();
		const found = await db.query.promoCodes.findFirst({
			where: and(
				eq(promoCodes.propertyId, rt.propertyId),
				eq(promoCodes.code, promoCode),
				eq(promoCodes.isActive, true)
			)
		});
		if (found) {
			const expired   = found.expiresAt && found.expiresAt < now;
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

	const totalAfterDiscountsCents = Math.max(
		0,
		subtotalCents + extraGuestTotalCents - losDiscountCents - promoDiscountCents
	);

	return json({
		lines,
		subtotalCents,
		nightsTotal,
		minNightWarning,
		extraGuestNights,
		extraGuestFeeCents: extraGuestFee,
		extraGuestTotalCents,
		losDiscount,
		losDiscountCents,
		promo,
		promoDiscountCents,
		totalAfterDiscountsCents
	} satisfies PublicPricing);
};
