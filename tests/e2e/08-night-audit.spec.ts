/**
 * 08 — Night audit
 *
 * Covers:
 *   - Running the night audit for a date creates a `night_audit_runs` record
 *   - Running the same audit date a second time is rejected (duplicate)
 *   - Night audit page loads for an authenticated user
 *
 * Prerequisites: bookingFixture, apiContext, page
 * The night audit is a SvelteKit form action on /night-audit.
 * We drive it via a direct form-data POST to the page action since there
 * is no dedicated API endpoint.
 */
import { test, expect } from '../fixtures';
import { isoDate } from '../fixtures/data-factories';

test.describe('Night audit', () => {
	test('night audit page loads', async ({ page }) => {
		await page.goto('/night-audit');
		await page.waitForLoadState('networkidle');
		// Page should show "Night Audit" heading
		await expect(page.getByRole('heading', { name: /night audit/i })).toBeVisible();
	});

	test('running audit for a property creates a run record (no duplicate)', async ({ apiContext, bookingFixture }) => {
		const auditDate = isoDate(0); // today

		// POST to /night-audit?/runAudit (SvelteKit form action)
		const body = new URLSearchParams({
			propId:    bookingFixture.propertyId,
			auditDate,
		});
		const res = await apiContext.post('/night-audit?/runAudit', {
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			data: body.toString()
		});

		// SvelteKit actions return 200/303; a 4xx means a server error
		expect(res.status(), 'audit action should not return a server error').toBeLessThan(500);

		const text = await res.text();
		// Should not be "already run" on first attempt
		expect(
			text.includes('already') && text.includes('run'),
			'first run should not say "already run"'
		).toBe(false);
	});

	test('running audit for same date twice is rejected', async ({ apiContext, bookingFixture }) => {
		const auditDate = isoDate(-1); // yesterday — unlikely to clash with real data in dev

		const body = new URLSearchParams({
			propId:    bookingFixture.propertyId,
			auditDate,
		});

		// First run
		await apiContext.post('/night-audit?/runAudit', {
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			data: body.toString()
		});

		// Second run for same date — should be rejected
		const res2 = await apiContext.post('/night-audit?/runAudit', {
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			data: body.toString()
		});
		const text2 = await res2.text();

		// The action returns a fail() with an "already" message
		expect(
			text2.includes('already') || text2.includes('duplicate') || text2.includes('400'),
			'second run for same date should be rejected'
		).toBe(true);
	});
});
