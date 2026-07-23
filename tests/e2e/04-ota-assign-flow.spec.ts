/**
 * OTA booking lifecycle: webhook → unassigned queue → room assign → guest card
 *
 * Business scenario:
 *   1. A booking arrives via Channex webhook (OTA like Booking.com).
 *   2. The booking appears in the operator's "Unassigned Bookings" list.
 *   3. The operator clicks "Find Room on Grid".
 *   4. The grid enters assign-mode.
 *   5. Clicking an available cell silently assigns the room and then opens
 *      the BookingCard pre-populated with the guest's name and details.
 *
 * This spec uses the `bookingFixture` so it operates on a self-contained
 * test property and never touches your real data.
 *
 * Requires TEST_PROPERTY_ID to be set in .env (or TEST_CHANNEX_* for live mode).
 */
import { test, expect } from '../fixtures';
import { createWebhookTrigger, isoDate } from '../fixtures/data-factories';

test.describe('OTA booking → unassigned queue → room assign', () => {

	test('webhook creates booking in DB as unassigned + confirmed', async ({
		apiContext, bookingFixture
	}) => {
		const otaRef    = `PLAY-OTA-${Date.now()}`;
		const guestName = `OTA Guest ${Date.now()}`;

		// ── 1. Fire webhook ────────────────────────────────────────────────────
		const triggerRes = await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({
				propertyId: bookingFixture.propertyId,
				roomTypeId: bookingFixture.roomTypeId,
				otaRef,
				guestName,
				guestEmail: `ota+${Date.now()}@test.local`,
				checkIn:  bookingFixture.checkIn,
				checkOut: bookingFixture.checkOut,
			})
		});
		expect(triggerRes.ok(), `Webhook trigger should succeed, got ${triggerRes.status()}`).toBe(true);

		// ── 2. Verify booking exists in DB as confirmed + unassigned ─────────
		const results = await (
			await apiContext.get('/api/booking/search', { params: { otaRef } })
		).json();
		expect(results.length, 'booking should exist').toBeGreaterThan(0);
		expect(results[0].status,     'booking should be confirmed').toBe('confirmed');
		expect(results[0].roomId,     'booking should be unassigned').toBeNull();
		expect(results[0].propertyId).toBe(bookingFixture.propertyId);
		expect(results[0].guestName,  'guest name should be saved').toBe(guestName);
	});

	test('after assign-mode: assigned booking has roomId set in DB', async ({
		apiContext, bookingFixture
	}) => {
		const otaRef    = `PLAY-ASSIGN-${Date.now()}`;
		const guestName = `Assign Guest ${Date.now()}`;

		// Create the OTA booking
		await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({
				propertyId: bookingFixture.propertyId,
				roomTypeId: bookingFixture.roomTypeId,
				otaRef, guestName,
				checkIn:  bookingFixture.checkIn,
				checkOut: bookingFixture.checkOut,
			})
		});

		const [booking] = await (
			await apiContext.get('/api/booking/search', { params: { otaRef } })
		).json();
		expect(booking, 'booking should exist').toBeTruthy();

		// Use the assign-room API directly (tests the server logic in isolation)
		const assignRes = await apiContext.post(`/api/booking/${booking.id}/assign-room`, {
			data: { roomId: bookingFixture.roomId }
		});
		expect(assignRes.ok(), `assign-room should succeed, got ${assignRes.status()}`).toBe(true);

		const assignBody = await assignRes.json();
		expect(assignBody.success, 'should return { success: true }').toBe(true);
		expect(assignBody.roomNumber, 'should return the room number').toBe(bookingFixture.roomNumber);

		// Verify in DB
		const after = await (
			await apiContext.get('/api/booking/search', { params: { otaRef } })
		).json();
		expect(after[0].roomId, 'roomId should now be set').toBe(bookingFixture.roomId);
		expect(after[0].roomNumber, 'room number should match').toBe(bookingFixture.roomNumber);
	});

	test('assigning a room to an already-assigned booking is rejected (conflict)', async ({
		apiContext, bookingFixture
	}) => {
		const otaRef = `PLAY-CONFLICT-${Date.now()}`;

		// Create + assign booking 1
		await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({
				propertyId: bookingFixture.propertyId,
				roomTypeId: bookingFixture.roomTypeId,
				otaRef,
				checkIn:  bookingFixture.checkIn,
				checkOut: bookingFixture.checkOut,
			})
		});
		const [b1] = await (
			await apiContext.get('/api/booking/search', { params: { otaRef } })
		).json();
		await apiContext.post(`/api/booking/${b1.id}/assign-room`, {
			data: { roomId: bookingFixture.roomId }
		});

		// Create booking 2 for the same dates
		const otaRef2 = `PLAY-CONFLICT2-${Date.now()}`;
		await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({
				propertyId: bookingFixture.propertyId,
				roomTypeId: bookingFixture.roomTypeId,
				otaRef: otaRef2,
				checkIn:  bookingFixture.checkIn,
				checkOut: bookingFixture.checkOut,
			})
		});
		const [b2] = await (
			await apiContext.get('/api/booking/search', { params: { otaRef: otaRef2 } })
		).json();

		// Try to assign booking 2 to the same room — should fail
		const conflictRes = await apiContext.post(`/api/booking/${b2.id}/assign-room`, {
			data: { roomId: bookingFixture.roomId }
		});
		expect(conflictRes.status(), 'should reject with 409 Conflict').toBe(409);

		const conflictBody = await conflictRes.json();
		expect(conflictBody.error, 'error message should mention the room or dates').toBeTruthy();
	});

});
