/**
 * Channex ARI payload format validation (API tests — no browser).
 *
 * Business scenario:
 *   When an operator updates a rate or availability in the Inventory grid,
 *   the app pushes an ARI update to Channex. If the payload format is wrong
 *   (wrong field names, cents instead of dollars, invalid date format, etc.),
 *   Channex will silently reject it and OTAs won't be updated.
 *
 * These tests validate that every ARI push we make produces a payload that
 * matches the Channex API contract defined in tests/schemas/channex.schema.ts.
 *
 * How it works:
 *   1. We trigger an ARI override via the /api/ari/override endpoint
 *   2. We read the mock ARI log via /api/dev/channex-log
 *   3. We validate every entry in the log against the schema
 *
 * Uses `bookingFixture` which creates a test room type with fake Channex IDs
 * so the ARI mock fires without needing a real Channex account.
 *
 * Prerequisites:
 *   - CHANNEX_MOCK=true in .env
 */
import { test, expect } from '../fixtures';
import { validateARIEntry } from '../schemas/channex.schema';
import { isoDate } from '../fixtures/data-factories';

test.describe('Channex ARI payload format', () => {

	test.beforeEach(async ({ apiContext }) => {
		// Clear the ARI log before each test so we only inspect the pushes we trigger
		await apiContext.delete('/api/dev/channex-log');
	});

	test('rate override produces a valid Channex ARI payload', async ({ apiContext, bookingFixture }) => {
		const testDate = isoDate(21); // 3 weeks out — unlikely to conflict with real bookings

		// ── Trigger an ARI override ────────────────────────────────────────────
		const overrideRes = await apiContext.post('/api/ari/override', {
			data: {
				roomTypeId: bookingFixture.roomTypeId,
				date: testDate,
				rateCents: 14900,  // $149.00
			}
		});
		expect(overrideRes.ok(), `ARI override endpoint should return 2xx, got ${overrideRes.status()}`).toBe(true);

		// Give the async ARI push a moment to complete
		await new Promise(r => setTimeout(r, 500));

		// ── Read the mock ARI log ──────────────────────────────────────────────
		const logRes = await apiContext.get('/api/dev/channex-log');
		expect(logRes.ok()).toBe(true);

		const logEntries: Array<{ updates: unknown[] }> = await logRes.json();
		expect(logEntries.length, 'at least one ARI push should have been logged').toBeGreaterThan(0);

		// ── Validate every update entry in every log record ───────────────────
		for (const logEntry of logEntries) {
			for (const update of logEntry.updates) {
				const errors = validateARIEntry(update);
				expect(
					errors,
					`ARI entry failed Channex schema validation:\n${JSON.stringify(update, null, 2)}\nErrors: ${errors.join('; ')}`
				).toHaveLength(0);
			}
		}
	});

	test('rate value is in dollars (not cents)', async ({ apiContext, bookingFixture }) => {
		await apiContext.delete('/api/dev/channex-log');

		const testDate = isoDate(22);
		await apiContext.post('/api/ari/override', {
			data: { roomTypeId: bookingFixture.roomTypeId, date: testDate, rateCents: 9900 } // $99.00 = 9900 cents
		});

		await new Promise(r => setTimeout(r, 500));

		const log: Array<{ updates: unknown[] }> = await (await apiContext.get('/api/dev/channex-log')).json();
		const allUpdates = log.flatMap(e => e.updates) as Array<Record<string, unknown>>;
		const rateUpdates = allUpdates.filter(u => u.rate !== undefined);

		expect(rateUpdates.length, 'should have at least one rate update').toBeGreaterThan(0);
		for (const u of rateUpdates) {
			expect(
				typeof u.rate === 'number' && u.rate < 1000,
				`rate should be dollars (< 1000) but got ${u.rate} — looks like cents were sent`
			).toBe(true);
		}
	});

	test('date fields are in YYYY-MM-DD format', async ({ apiContext, bookingFixture }) => {
		await apiContext.delete('/api/dev/channex-log');

		const testDate = isoDate(23);
		await apiContext.post('/api/ari/override', {
			data: { roomTypeId: bookingFixture.roomTypeId, date: testDate }
		});

		await new Promise(r => setTimeout(r, 500));

		const log: Array<{ updates: unknown[] }> = await (await apiContext.get('/api/dev/channex-log')).json();
		const allUpdates = log.flatMap(e => e.updates) as Array<Record<string, unknown>>;

		const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
		for (const u of allUpdates) {
			if (u.date_from)
				expect(ISO_DATE.test(String(u.date_from)), `date_from "${u.date_from}" must be YYYY-MM-DD`).toBe(true);
			if (u.date_to)
				expect(ISO_DATE.test(String(u.date_to)), `date_to "${u.date_to}" must be YYYY-MM-DD`).toBe(true);
		}
	});

});
