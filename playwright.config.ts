import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for fsapp.
 *
 * Three test projects run in order:
 *   1. setup   — logs in once and saves auth cookies to .playwright/auth.json
 *   2. e2e     — full browser tests (bookings, check-in/out, channex flow)
 *   3. api     — HTTP-only tests (payload format validation, webhook parsing)
 *
 * Running:
 *   pnpm test              — run all tests (starts dev server automatically)
 *   pnpm test:ui           — open Playwright UI (great for debugging)
 *   pnpm test:headed       — run with a visible browser window
 *   pnpm test:api          — run only API tests (fast, no browser)
 *   pnpm test:report       — open the last HTML report
 *
 * Auth:
 *   Set TEST_EMAIL and TEST_PASSWORD in .env. The globalSetup script creates
 *   or updates that user in local.db automatically before tests run, so no
 *   manual seed step is needed.
 */
export default defineConfig({
	testDir: './tests',

	// Global setup: creates/updates the test user in local.db before tests run.
	globalSetup: './tests/setup/global-setup.ts',

	// Run tests in each file in parallel but files sequentially within a project.
	fullyParallel: true,

	// Fail the build on CI if you accidentally left test.only in source.
	forbidOnly: !!process.env.CI,

	// Retry once on CI to reduce flakiness from timing issues.
	retries: process.env.CI ? 1 : 0,

	// Use fewer workers on CI; unlimited locally.
	workers: process.env.CI ? 2 : undefined,

	reporter: [
		['html', { outputFolder: '.playwright/report', open: 'never' }],
		['line']
	],

	use: {
		baseURL: 'http://localhost:5174',

		// Collect trace on first retry so failures are debuggable.
		trace: 'on-first-retry',

		// Screenshot on failure.
		screenshot: 'only-on-failure',
	},

	projects: [
		// ── 1. Auth setup ────────────────────────────────────────────────────────
		// Runs first, logs in, saves cookies to .playwright/auth.json.
		// All subsequent projects load that file so they start already authenticated.
		{
			name: 'setup',
			testMatch: /setup\/auth\.setup\.ts/,
			use: { ...devices['Desktop Chrome'] },
		},

		// ── 2. Full-browser E2E tests ─────────────────────────────────────────────
		{
			name: 'e2e',
			testMatch: /e2e\/.*\.spec\.ts/,
			use: {
				...devices['Desktop Chrome'],
				storageState: '.playwright/auth.json',
			},
			dependencies: ['setup'],
		},

		// ── 3. API-only tests (no browser, much faster) ───────────────────────────
		{
			name: 'api',
			testMatch: /api\/.*\.spec\.ts/,
			use: {
				storageState: '.playwright/auth.json',
			},
			dependencies: ['setup'],
		},
	],

	// Automatically start the dev server before tests run.
	// reuseExistingServer: true means if you already have `pnpm dev` running,
	// it won't start a second instance — just connect to the existing one.
	webServer: {
		command: 'pnpm dev',
		url: 'http://localhost:5174',
		reuseExistingServer: true,
		timeout: 60_000,
		stdout: 'ignore',
		stderr: 'pipe',
	},
});
