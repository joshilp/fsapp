/**
 * Test data factories.
 *
 * These functions create consistent, realistic test payloads so spec files
 * don't scatter magic strings and inline objects everywhere.
 *
 * Convention:
 *   - All factories accept an optional `overrides` argument so individual tests
 *     can customise just the fields they care about.
 *   - Dates are always relative to "today" so tests don't break as time passes.
 *   - IDs in test data use a recognisable prefix (e.g. "test-" or "playwright-")
 *     so they can be cleaned up without touching real data.
 */

/** Returns YYYY-MM-DD for a date N days from today. */
export function isoDate(offsetDays = 0): string {
	const d = new Date();
	d.setDate(d.getDate() + offsetDays);
	return d.toISOString().slice(0, 10);
}

// ─── Channex webhook trigger payload ─────────────────────────────────────────

export type WebhookTriggerPayload = {
	event: 'booking_new' | 'booking_cancel';
	channexPropertyId: string;
	channexRoomTypeId: string;
	channexRatePlanId: string;
	checkIn: string;
	checkOut: string;
	adults: number;
	children: number;
	guestName: string;
	guestEmail: string | null;
	guestPhone: string | null;
	otaName: string;
	totalPrice: string;
	notes: string | null;
	otaRef: string;
};

/**
 * Builds a webhook trigger payload for a new OTA booking.
 * Requires channexPropertyId, channexRoomTypeId, channexRatePlanId from your
 * test property (set these in .env as TEST_CHANNEX_PROPERTY_ID etc.).
 */
export function createWebhookTrigger(
	overrides: Partial<WebhookTriggerPayload> = {}
): WebhookTriggerPayload {
	return {
		event: 'booking_new',
		channexPropertyId: process.env.TEST_CHANNEX_PROPERTY_ID ?? '',
		channexRoomTypeId: process.env.TEST_CHANNEX_ROOM_TYPE_ID ?? '',
		channexRatePlanId: process.env.TEST_CHANNEX_RATE_PLAN_ID ?? '',
		checkIn:    isoDate(7),
		checkOut:   isoDate(10),
		adults:     2,
		children:   0,
		guestName:  `Playwright Guest ${Date.now()}`,
		guestEmail: `playwright+${Date.now()}@test.local`,
		guestPhone: null,
		otaName:    'Test OTA',
		totalPrice: '297.00',
		notes:      'Automated test booking — safe to delete',
		otaRef:     `PLAY-${Date.now()}`,
		...overrides,
	};
}

// ─── ARI update (what we push to Channex) ────────────────────────────────────

export type ARIUpdatePayload = {
	roomTypeId: string;
	date: string;
	availabilityDelta?: number;
	rateCents?: number;
	stopSell?: boolean;
	minNights?: number;
};

export function createARIOverride(overrides: Partial<ARIUpdatePayload> = {}): ARIUpdatePayload {
	return {
		roomTypeId: process.env.TEST_ROOM_TYPE_ID ?? '',
		date: isoDate(14),
		rateCents: 14900,
		...overrides,
	};
}
