/**
 * Channex webhook → booking creation (E2E).
 *
 * Business scenario:
 *   A guest books via Booking.com. Channex fires a `booking_new` webhook.
 *   The app creates a confirmed booking visible in the unassigned queue.
 *   When cancelled, the booking is marked cancelled.
 *
 * This test uses /api/dev/channex-trigger which works in two modes:
 *   - With TEST_CHANNEX_* env vars: uses real Channex IDs (tests the full path)
 *   - With TEST_PROPERTY_ID + TEST_ROOM_TYPE_ID: uses internal IDs (no subscription needed)
 *
 * After each webhook, we verify the booking actually exists in the DB via
 * /api/booking/search — not just that the webhook was accepted.
 */
import { test, expect } from '../fixtures';
import { createWebhookTrigger, isoDate } from '../fixtures/data-factories';

test.describe('Channex webhook → booking creation', () => {

	function skipIfNoIds() {
		const hasChannex  = !!process.env.TEST_CHANNEX_PROPERTY_ID;
		const hasInternal = !!process.env.TEST_PROPERTY_ID;
		if (!hasChannex && !hasInternal) {
			test.skip(true, 'Set TEST_PROPERTY_ID (or TEST_CHANNEX_PROPERTY_ID) in .env to run this test');
			return true;
		}
		return false;
	}

	test('booking_new webhook creates a confirmed booking in the DB', async ({ apiContext }) => {
		if (skipIfNoIds()) return;

		const otaRef  = `PLAY-NEW-${Date.now()}`;
		const payload = createWebhookTrigger({
			checkIn:  isoDate(30),
			checkOut: isoDate(33),
			otaName:  'Booking.com',
			otaRef,
			guestEmail: `playwright+${Date.now()}@test.local`,
		});

		// ── Fire the webhook ───────────────────────────────────────────────────
		const triggerRes = await apiContext.post('/api/dev/channex-trigger', { data: payload });
		expect(triggerRes.ok(), `trigger should return 200, got ${triggerRes.status()}`).toBe(true);

		const triggerBody = await triggerRes.json();
		expect(triggerBody.ok,              'webhook handler should accept the payload').toBe(true);
		expect(triggerBody.result?.received, 'handler should return { received: true }').toBe(true);

		// ── Verify the booking was actually written to the DB ──────────────────
		const searchRes = await apiContext.get('/api/booking/search', { params: { otaRef } });
		expect(searchRes.ok(), 'search endpoint should return 200').toBe(true);

		const results = await searchRes.json();
		expect(results.length, `booking with OTA ref ${otaRef} should exist`).toBeGreaterThan(0);

		const booking = results[0];
		expect(booking.status,                'booking should be confirmed').toBe('confirmed');
		expect(booking.roomId,                'booking should start unassigned').toBeNull();
		expect(booking.otaConfirmationNumber, 'OTA ref should be saved').toBe(otaRef);
		expect(booking.guestName,             'guest name should be saved').toBeTruthy();
		expect(booking.channelName,           'channel should be set to the OTA name').toBeTruthy();
	});

	test('booking_cancel webhook marks the booking as cancelled', async ({ apiContext }) => {
		if (skipIfNoIds()) return;

		// Create a booking to cancel
		const otaRef = `PLAY-CANCEL-${Date.now()}`;
		await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({ otaRef, checkIn: isoDate(60), checkOut: isoDate(63) })
		});

		// Verify it was created
		const before = await (await apiContext.get('/api/booking/search', { params: { otaRef } })).json();
		expect(before.length, 'booking should exist before cancellation').toBeGreaterThan(0);
		expect(before[0].status).toBe('confirmed');

		// Fire the cancellation
		const cancelRes = await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({ event: 'booking_cancel', otaRef, checkIn: isoDate(60), checkOut: isoDate(63) })
		});
		expect(cancelRes.ok()).toBe(true);
		const cancelBody = await cancelRes.json();
		expect(cancelBody.ok).toBe(true);

		// Verify booking is now cancelled in the DB
		const after = await (await apiContext.get('/api/booking/search', { params: { otaRef } })).json();
		expect(after.length, 'booking should still exist').toBeGreaterThan(0);
		expect(after[0].status, 'booking should be cancelled').toBe('cancelled');
	});

	test('booking_update webhook updates dates on an existing booking', async ({ apiContext }) => {
		if (skipIfNoIds()) return;

		// First create the booking via booking_new
		const otaRef = `PLAY-UPDATE-${Date.now()}`;
		const originalCheckIn  = isoDate(35);
		const originalCheckOut = isoDate(38);

		await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({
				otaRef, checkIn: originalCheckIn, checkOut: originalCheckOut,
				guestEmail: `playwright+update+${Date.now()}@test.local`
			})
		});

		const before = await (await apiContext.get('/api/booking/search', { params: { otaRef } })).json();
		expect(before.length, 'booking should exist before update').toBeGreaterThan(0);
		expect(before[0].checkInDate, 'initial check-in should match').toBe(originalCheckIn);

		// Fire booking_update with new dates
		const newCheckIn  = isoDate(36);
		const newCheckOut = isoDate(39);
		const updateRes = await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({
				event:    'booking_update',
				otaRef,
				checkIn:  newCheckIn,
				checkOut: newCheckOut,
				adults:   3
			})
		});
		expect(updateRes.ok(), 'booking_update trigger should succeed').toBe(true);

		// Verify the booking was updated
		const after = await (await apiContext.get('/api/booking/search', { params: { otaRef } })).json();
		expect(after.length, 'booking should still exist after update').toBeGreaterThan(0);
		expect(after[0].checkInDate,  'check-in should be updated').toBe(newCheckIn);
		expect(after[0].checkOutDate, 'check-out should be updated').toBe(newCheckOut);
		expect(after[0].numAdults,    'adults should be updated').toBe(3);
		expect(after[0].status,       'booking should remain confirmed').toBe('confirmed');
	});

});
