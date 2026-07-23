/**
 * Shared test fixtures.
 *
 * Import `test` and `expect` from THIS file (not directly from @playwright/test)
 * so that all custom fixtures are available in every spec file.
 *
 * Usage:
 *   import { test, expect } from '../fixtures';
 *
 * Available fixtures (in addition to Playwright built-ins):
 *   apiContext     — authenticated API request context for raw HTTP calls
 *   bookingFixture — a fully seeded test property with room/type/rate/publicId,
 *                    torn down automatically after each test that uses it
 */
import { test as base } from '@playwright/test';
import { type APIRequestContext } from '@playwright/test';
import path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BookingFixture = {
	propertyId:   string;
	propertyName: string;
	publicId:     string;
	roomTypeId:   string;
	roomTypeName: string;
	roomId:       string;
	roomNumber:   string;
	seasonId:     string;
	nightlyRate:  number;  // dollars
	/** ISO dates relative to fixture creation — good for 90 days */
	checkIn:  string;
	checkOut: string;
};

type Fixtures = {
	apiContext:     APIRequestContext;
	bookingFixture: BookingFixture;
};

// ─── Helper: dates ────────────────────────────────────────────────────────────

function addDays(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export const test = base.extend<Fixtures>({

	/** Authenticated API context — use for HTTP calls in tests */
	apiContext: async ({ playwright }, use) => {
		const ctx = await playwright.request.newContext({
			baseURL: 'http://localhost:5174',
			storageState: path.join(process.cwd(), '.playwright/auth.json'),
		});
		await use(ctx);
		await ctx.dispose();
	},

	/**
	 * Seeds a complete test property (property → roomType → room → rateSeason → rateTier)
	 * and tears everything down after the test.
	 *
	 * Uses the /api/test/seed and /api/test/cleanup endpoints (dev-only, behind auth).
	 * This avoids coupling tests to dev DB state.
	 */
	bookingFixture: async ({ apiContext }, use) => {
		// Seed via the test-seed endpoint
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `playwright-${Date.now()}` }
		});

		if (!seedRes.ok()) {
			throw new Error(
				`Failed to seed test fixture (${seedRes.status()}): ${await seedRes.text()}`
			);
		}

		const fixture: BookingFixture = await seedRes.json();

		// Run the test
		await use(fixture);

		// Teardown: delete everything created for this fixture
		await apiContext.delete('/api/test/seed', {
			data: { propertyId: fixture.propertyId }
		}).catch(() => {
			// Non-fatal — test data can be cleaned up manually if needed
			console.warn(`[fixture] cleanup failed for property ${fixture.propertyId}`);
		});
	},
});

export { expect } from '@playwright/test';
