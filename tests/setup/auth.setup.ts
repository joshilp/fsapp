/**
 * Auth setup — runs once before all test projects.
 *
 * Logs in using TEST_EMAIL + TEST_PASSWORD from the environment (or .env),
 * then saves the browser storage state (cookies + localStorage) to
 * .playwright/auth.json so all subsequent tests start pre-authenticated.
 *
 * If you change your test user password, delete .playwright/auth.json and
 * re-run `pnpm test` — the setup step will log in fresh.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(process.cwd(), '.playwright/auth.json');

setup('authenticate as test user', async ({ page }) => {
	const email    = process.env.TEST_EMAIL    ?? 'admin@example.com';
	const password = process.env.TEST_PASSWORD ?? 'password';

	await page.goto('/auth/login');

	// Fill the sign-in form using stable IDs from Login.svelte
	await page.locator('#signin-email').fill(email);
	await page.locator('#signin-password').fill(password);
	await page.getByRole('button', { name: /sign in/i }).click();

	// After successful login we should land on /booking (the default app page)
	await page.waitForURL(/\/(booking|$)/, { timeout: 15_000 });
	await expect(page.getByRole('navigation'), 'navbar should be visible after login').toBeVisible();

	// Persist the session for all subsequent tests
	await page.context().storageState({ path: AUTH_FILE });
	console.log(`  ✓ Authenticated as ${email} — session saved to .playwright/auth.json`);
});
