/**
 * Shared rate-resolution helpers used by rate-calendar, public-book, and reports.
 */

/**
 * Parse the dow_rates JSON string stored on a rate tier.
 * Returns a 7-element array indexed 0=Sun…6=Sat, null elements mean "use base rate".
 */
export function parseDowRates(dowRatesJson: string | null | undefined): (number | null)[] {
	if (!dowRatesJson) return [null, null, null, null, null, null, null];
	try {
		const arr = JSON.parse(dowRatesJson);
		if (!Array.isArray(arr) || arr.length !== 7) return [null, null, null, null, null, null, null];
		return arr.map((v) => (typeof v === 'number' ? v : null));
	} catch {
		return [null, null, null, null, null, null, null];
	}
}

/**
 * Serialize DOW rates array to JSON for storage.
 * Normalizes non-positive or NaN values to null.
 */
export function serializeDowRates(arr: (number | null)[]): string | null {
	const normalized = arr.map((v) =>
		typeof v === 'number' && isFinite(v) && v > 0 ? v : null
	);
	if (normalized.every((v) => v === null)) return null;
	return JSON.stringify(normalized);
}

/**
 * Resolve the effective nightly rate for a specific date, applying DOW override if set.
 * dateStr — ISO "YYYY-MM-DD"
 * baseRate — base nightly rate in cents from the rate tier
 * dowRatesJson — raw dow_rates JSON string from the tier (may be null)
 */
export function resolveNightlyRate(
	baseRate: number,
	dowRatesJson: string | null | undefined,
	dateStr: string
): number {
	const dow = parseDowRates(dowRatesJson);
	const dayOfWeek = new Date(dateStr + 'T12:00:00').getDay(); // 0=Sun…6=Sat
	return dow[dayOfWeek] ?? baseRate;
}
