/**
 * Guest-facing booking flow — /book/[publicId]
 *
 * Business scenario:
 *   A guest visits the property's booking page, selects dates and a room type,
 *   enters their details, submits the form, and receives a confirmation page.
 *   The booking should exist in the DB as confirmed, unassigned, with the
 *   correct guest details and quoted price.
 *
 * This spec uses the `bookingFixture` to create a fresh test property and
 *  rate so it never touches your real properties.
 */
import { test, expect } from '../fixtures';

test.describe('Guest-facing booking flow (/book/[publicId])', () => {

	test('booking page loads and shows property name', async ({ page, bookingFixture }) => {
		await page.goto(`/book/${bookingFixture.publicId}`);
		await page.waitForLoadState('networkidle');

		await expect(page).not.toHaveURL('/404');
		// Property name appears in the header (may appear more than once — just need it visible)
		await expect(page.getByText(bookingFixture.propertyName).first()).toBeVisible();
	});

	test('date and room type selection works', async ({ page, bookingFixture }) => {
		await page.goto(`/book/${bookingFixture.publicId}`);
		await page.waitForLoadState('networkidle');

		// Fill in check-in and check-out using the date input ids
		await page.locator('#ci').fill(bookingFixture.checkIn);
		await page.locator('#co').fill(bookingFixture.checkOut);

		// Step 1 → Step 2: "See Available Rooms →" button
		await page.getByRole('button', { name: /See Available Rooms/i }).click();

		// The room type should appear in step 2
		await expect(page.getByText(bookingFixture.roomTypeName)).toBeVisible({ timeout: 10_000 });
	});

	test('full booking flow: server creates booking and confirmation page shows details', async ({ page, apiContext, bookingFixture }) => {
		const guestName  = `E2E Guest ${Date.now()}`;
		const guestEmail = `e2e+${Date.now()}@test.local`;

		// ── Submit booking via form action (tests server-side logic directly) ──
		// SvelteKit form actions accept application/x-www-form-urlencoded
		const formBody = new URLSearchParams({
			propertyId:  bookingFixture.propertyId,
			roomTypeId:  bookingFixture.roomTypeId,
			checkIn:     bookingFixture.checkIn,
			checkOut:    bookingFixture.checkOut,
			guestName,
			guestEmail,
			numAdults:   '2',
			numChildren: '0',
		});

		const actionRes = await apiContext.post(`/book/${bookingFixture.publicId}?/book`, {
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			data: formBody.toString()
		});
		expect(actionRes.ok(), 'form action should return 200').toBe(true);

		// SvelteKit action results: { type: 'success', data: {...} }
		// Note: SvelteKit encodes `data` with devalue, so we query the DB for the token
		// instead of trying to parse the encoded response directly.
		const actionBody = await actionRes.json();
		expect(actionBody.type, `form action failed — server said: ${JSON.stringify(actionBody.data)}`).toBe('success');

		// ── Look up the booking to get its public token ────────────────────────
		// Give the server a moment to finish any async side-effects before querying
		await new Promise(resolve => setTimeout(resolve, 200));
		const searchRes = await apiContext.get('/api/booking/search', { params: { guestEmail } });
		const results = await searchRes.json();
		expect(results.length, 'booking should exist in DB after successful action').toBeGreaterThan(0);

		const b = results[0];
		const token = b.publicToken;
		expect(token, 'booking should have a public confirmation token in DB').toBeTruthy();

		// ── Confirmation page loads with booking details ────────────────────────
		await page.goto(`/book/confirmation/${token}`);
		await page.waitForLoadState('networkidle');

		// The confirmation page shows the guest name and a "confirmed" heading
		await expect(page.getByText(/your reservation is confirmed/i)).toBeVisible({ timeout: 10_000 });
		await expect(page.getByText(guestName)).toBeVisible({ timeout: 5_000 });

		// ── DB verification ────────────────────────────────────────────────────
		expect(b.status,       'booking should be confirmed').toBe('confirmed');
		expect(b.roomId,       'booking should start unassigned').toBeNull();
		expect(b.propertyId,   'booking should belong to the test property').toBe(bookingFixture.propertyId);
		expect(b.checkInDate,  'check-in should match').toBe(bookingFixture.checkIn);
		expect(b.checkOutDate, 'check-out should match').toBe(bookingFixture.checkOut);
		expect(b.guestName,    'guest name should be saved').toBe(guestName);
		expect(b.guestEmail,   'guest email should be saved').toBe(guestEmail);
	});

	test('unavailable property shows appropriate message', async ({ page }) => {
		const res = await page.goto('/book/nonexistent-public-id-xyz');
		const statusOrUrl = res?.status() ?? 0;
		const is404  = statusOrUrl === 404;
		const is3xx  = statusOrUrl >= 300 && statusOrUrl < 400;
		const onError = page.url().includes('404') || page.url().includes('error');
		expect(is404 || is3xx || onError, 'should handle unknown publicId gracefully').toBe(true);
	});

	test('public availability API returns correct room type data', async ({ apiContext, bookingFixture }) => {
		const res = await apiContext.get('/api/public/availability', {
			params: {
				propertyId: bookingFixture.propertyId,
				checkIn:    bookingFixture.checkIn,
				checkOut:   bookingFixture.checkOut,
			}
		});
		expect(res.ok(), 'availability endpoint should return 200').toBe(true);

		const data = await res.json();
		expect(Array.isArray(data), 'response should be an array').toBe(true);
		expect(data.length, 'should return at least one room type').toBeGreaterThan(0);

		const rt = data.find((r: { id: string }) => r.id === bookingFixture.roomTypeId);
		expect(rt, 'fixture room type should be listed').toBeTruthy();
		expect(rt.availableCount, 'fixture room should be available').toBeGreaterThan(0);
	});

	test('public pricing API returns correct nightly rate', async ({ apiContext, bookingFixture }) => {
		const res = await apiContext.get('/api/public/pricing', {
			params: {
				roomTypeId: bookingFixture.roomTypeId,
				checkIn:    bookingFixture.checkIn,
				checkOut:   bookingFixture.checkOut,
			}
		});
		expect(res.ok(), 'pricing endpoint should return 200').toBe(true);

		const data = await res.json();
		// API returns `nightsTotal` (not `totalNights`)
		expect(data.nightsTotal, 'should return correct night count').toBe(3);
		// 3 nights × $149 = $447 (in cents: 44700)
		const expected = bookingFixture.nightlyRate * 100 * 3;
		expect(data.subtotalCents, 'total should match rate × nights').toBe(expected);
	});

});
