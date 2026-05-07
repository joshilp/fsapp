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
 *   - apiContext  : an APIRequestContext pre-configured with baseURL + auth cookies,
 *                   useful for making raw HTTP requests without a browser.
 */
import { test as base } from '@playwright/test';
import { type APIRequestContext } from '@playwright/test';
import path from 'path';

type Fixtures = {
	/** Authenticated API request context — use for direct HTTP calls in tests. */
	apiContext: APIRequestContext;
};

export const test = base.extend<Fixtures>({
	apiContext: async ({ playwright }, use) => {
		const ctx = await playwright.request.newContext({
			baseURL: 'http://localhost:5173',
			storageState: path.join(process.cwd(), '.playwright/auth.json'),
		});
		await use(ctx);
		await ctx.dispose();
	},
});

export { expect } from '@playwright/test';
