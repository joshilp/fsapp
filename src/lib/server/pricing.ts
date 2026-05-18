/**
 * Shared rate-resolution logic used by both the inventory grid server and
 * the /api/pricing/suggest endpoint.  Having a single source of truth
 * prevents the two views from showing different prices for the same night.
 */

export interface SeasonForPricing {
	id: string;
	name: string;
	colour: string;
	startDate: string; // 'YYYY-MM-DD'
	endDate: string;   // 'YYYY-MM-DD'
	minNights: number;
	tiers: { roomTypeId: string; nightlyRate: number | null }[];
}

export interface NightRate {
	date: string;
	seasonId: string;
	seasonName: string;
	colour: string;
	/** Season/default rate before any ARI override. Null if nothing configured. */
	baseRateCents: number | null;
	/** Final effective rate — ARI override wins over baseRateCents. */
	rateCents: number;
	minNights: number;
}

export interface RateLine {
	seasonId: string;
	seasonName: string;
	colour: string;
	nights: number;
	unitCents: number;
	totalCents: number;
	minNights: number;
}

function rangeLengthMs(s: SeasonForPricing): number {
	return (
		new Date(s.endDate + 'T12:00:00').getTime() -
		new Date(s.startDate + 'T12:00:00').getTime()
	);
}

/**
 * Resolve the effective rate (in cents) for a single night.
 *
 * Rules (in priority order):
 *  1. ARI override for that date wins everything.
 *  2. Among overlapping seasons, the *shortest* date range wins
 *     ("most specific wins").
 *  3. Fallback to the room type's `defaultRateCents` when no season applies.
 *  4. 0 if nothing is configured.
 */
export function resolveNightRate(
	date: string,
	seasons: SeasonForPricing[],
	roomTypeId: string,
	defaultRateCents: number | null,
	overrideByDate: Map<string, number>
): NightRate {
	// Sort overlapping seasons: shortest (most specific) first
	const matching = seasons
		.filter((s) => s.startDate <= date && s.endDate >= date)
		.sort((a, b) => rangeLengthMs(a) - rangeLengthMs(b));

	let baseRateCents: number | null = null;
	let seasonId = '';
	let seasonName = '(no rate)';
	let colour = '#cccccc';
	let minNights = 1;

	for (const s of matching) {
		const tier = s.tiers.find((t) => t.roomTypeId === roomTypeId);
		if (tier) {
			baseRateCents = tier.nightlyRate;
			seasonId = s.id;
			seasonName = s.name;
			colour = s.colour;
			minNights = s.minNights;
			break;
		}
	}

	// Fallback to room-type default when no season covers this date
	if (baseRateCents === null && defaultRateCents != null) {
		baseRateCents = defaultRateCents;
		seasonName = 'Default rate';
		colour = '#888888';
	}

	// ARI per-date override wins over season / default
	const rateCents = overrideByDate.get(date) ?? (baseRateCents ?? 0);

	return { date, seasonId, seasonName, colour, baseRateCents, rateCents, minNights };
}

/**
 * Walk every night of a stay and return one NightRate per night.
 */
export function resolveStayRates(
	checkIn: string,
	checkOut: string,
	seasons: SeasonForPricing[],
	roomTypeId: string,
	defaultRateCents: number | null,
	overrideByDate: Map<string, number>
): NightRate[] {
	const nights: NightRate[] = [];
	let cur = checkIn;
	while (cur < checkOut) {
		nights.push(resolveNightRate(cur, seasons, roomTypeId, defaultRateCents, overrideByDate));
		// advance one day
		const d = new Date(cur + 'T12:00:00');
		d.setDate(d.getDate() + 1);
		cur = d.toISOString().slice(0, 10);
	}
	return nights;
}

/**
 * Collapse consecutive nights that share the same season AND rate into
 * a single line item (e.g. "Summer · 3 nights @ $129").
 */
export function buildRateLines(nights: NightRate[]): RateLine[] {
	const lines: RateLine[] = [];
	let i = 0;
	while (i < nights.length) {
		const cur = nights[i];
		let count = 1;
		while (
			i + count < nights.length &&
			nights[i + count].seasonId === cur.seasonId &&
			nights[i + count].rateCents === cur.rateCents
		) {
			count++;
		}
		lines.push({
			seasonId: cur.seasonId,
			seasonName: cur.seasonName,
			colour: cur.colour,
			nights: count,
			unitCents: cur.rateCents,
			totalCents: cur.rateCents * count,
			minNights: cur.minNights
		});
		i += count;
	}
	return lines;
}
