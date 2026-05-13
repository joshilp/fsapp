/**
 * Availability accuracy — booking reduces count; cancellation restores it
 *
 * Business scenario:
 *   The /api/public/availability endpoint is the source of truth for the
 *   guest-facing booking wizard. We need to verify:
 *   1. Available count decreases when a booking is created.
 *   2. Available count is restored when a booking is cancelled.
 *   3. Unassigned bookings (OTA / webhook) ALSO reduce available count.
 *   4. Double-booking the last room via the public booking action is rejected.
 *
 * Uses the bookingFixture (1 room, 1 room type) for complete isolation.
 */
import { test, expect } from '../fixtures';
import { type APIRequestContext } from '@playwright/test';
import { createWebhookTrigger } from '../fixtures/data-factories';

test.describe('Availability accuracy', () => {

	/** Helper: fetch available count for the fixture room type on fixture dates */
	async function getAvailableCount(
		apiContext: APIRequestContext,
		propertyId: string,
		roomTypeId: string,
		checkIn: string,
		checkOut: string
	): Promise<number> {
		const res = await apiContext.get('/api/public/availability', {
			params: { propertyId, checkIn, checkOut }
		});
		const data = await res.json();
		const rt = data.find((r: { id: string }) => r.id === roomTypeId);
		return rt?.availableCount ?? 0;
	}

	test('assigned booking reduces available count by 1', async ({ apiContext, bookingFixture }) => {
		const before = await getAvailableCount(
			apiContext,
			bookingFixture.propertyId,
			bookingFixture.roomTypeId,
			bookingFixture.checkIn,
			bookingFixture.checkOut
		);
		expect(before, 'fixture has 1 room, should have 1 available before booking').toBe(1);

		// Create a booking for the room
		const createRes = await apiContext.post('/api/booking', {
			data: {
				propertyId:   bookingFixture.propertyId,
				roomId:       bookingFixture.roomId,
				checkInDate:  bookingFixture.checkIn,
				checkOutDate: bookingFixture.checkOut,
				numAdults: 1, numChildren: 0,
				guestName: 'Avail Test 1', guestEmail: `avail1+${Date.now()}@test.local`,
				status: 'confirmed',
			}
		});
		expect(createRes.ok()).toBe(true);

		const after = await getAvailableCount(
			apiContext,
			bookingFixture.propertyId,
			bookingFixture.roomTypeId,
			bookingFixture.checkIn,
			bookingFixture.checkOut
		);
		expect(after, 'available count should drop to 0 after booking').toBe(0);
	});

	test('cancelled booking restores available count', async ({ apiContext, bookingFixture }) => {
		// Create
		const createRes = await apiContext.post('/api/booking', {
			data: {
				propertyId:   bookingFixture.propertyId,
				roomId:       bookingFixture.roomId,
				checkInDate:  bookingFixture.checkIn,
				checkOutDate: bookingFixture.checkOut,
				numAdults: 1, numChildren: 0,
				guestName: 'Avail Test 2', guestEmail: `avail2+${Date.now()}@test.local`,
				status: 'confirmed',
			}
		});
		const { id: bookingId } = await createRes.json();

		// Confirm count dropped
		const afterCreate = await getAvailableCount(
			apiContext,
			bookingFixture.propertyId,
			bookingFixture.roomTypeId,
			bookingFixture.checkIn,
			bookingFixture.checkOut
		);
		expect(afterCreate, 'count should be 0 after booking').toBe(0);

		// Cancel
		await apiContext.post(`/api/booking/${bookingId}/cancel`);

		// Count should be restored
		const afterCancel = await getAvailableCount(
			apiContext,
			bookingFixture.propertyId,
			bookingFixture.roomTypeId,
			bookingFixture.checkIn,
			bookingFixture.checkOut
		);
		expect(afterCancel, 'count should restore to 1 after cancellation').toBe(1);
	});

	test('unassigned OTA booking also reduces available count', async ({ apiContext, bookingFixture }) => {
		const before = await getAvailableCount(
			apiContext,
			bookingFixture.propertyId,
			bookingFixture.roomTypeId,
			bookingFixture.checkIn,
			bookingFixture.checkOut
		);
		expect(before).toBe(1);

		// Fire webhook — creates an unassigned booking for this room type
		const otaRef = `PLAY-AVAIL-${Date.now()}`;
		await apiContext.post('/api/dev/channex-trigger', {
			data: createWebhookTrigger({
				propertyId: bookingFixture.propertyId,
				roomTypeId: bookingFixture.roomTypeId,
				otaRef,
				checkIn:  bookingFixture.checkIn,
				checkOut: bookingFixture.checkOut,
			})
		});

		const after = await getAvailableCount(
			apiContext,
			bookingFixture.propertyId,
			bookingFixture.roomTypeId,
			bookingFixture.checkIn,
			bookingFixture.checkOut
		);
		expect(after, 'unassigned OTA booking should reduce available count').toBe(0);
	});

	test('public booking is rejected when no rooms available', async ({ apiContext, bookingFixture }) => {
		// First, consume the only room with an operator booking
		const blockEmail = `block+${Date.now()}@test.local`;
		const blockRes = await apiContext.post('/api/booking', {
			data: {
				propertyId:   bookingFixture.propertyId,
				roomId:       bookingFixture.roomId,
				checkInDate:  bookingFixture.checkIn,
				checkOutDate: bookingFixture.checkOut,
				numAdults: 1, numChildren: 0,
				guestName: 'Block Guest', guestEmail: blockEmail,
				status: 'confirmed',
			}
		});
		expect(blockRes.ok(), 'blocking booking should be created').toBe(true);

		const pubEmail = `pub+${Date.now()}@test.local`;

		// Attempt a public booking for the same dates — should be rejected
		// Note: SvelteKit form actions always return HTTP 200 regardless of fail().
		// We verify rejection by checking the response body for an error field,
		// and confirming the booking was NOT created in the DB.
		const publicRes = await apiContext.post(`/book/${bookingFixture.publicId}?/book`, {
			form: {
				propertyId:      bookingFixture.propertyId,
				roomTypeId:      bookingFixture.roomTypeId,
				checkIn:         bookingFixture.checkIn,
				checkOut:        bookingFixture.checkOut,
				guestName:       'Public Guest',
				guestEmail:      pubEmail,
				numAdults:       '1',
				numChildren:     '0',
			}
		});

		const body = await publicRes.json().catch(() => null);

		// Either the HTTP status is 4xx OR the response body contains an error
		const httpRejected   = publicRes.status() >= 400;
		const bodyHasError   = body && (body.error || body.data?.error || body.status === 'error');
		const bodyNoSuccess  = body && !body.success && !body.data?.success;

		// Most reliable check: confirm the overbooking guest was NOT created in DB
		const dbResults = await (
			await apiContext.get('/api/booking/search', { params: { guestEmail: pubEmail } })
		).json();
		expect(
			dbResults.length,
			'overbooking should be rejected — no booking should exist in DB for the overbooked guest'
		).toBe(0);

		// Also assert that the response indicated rejection somehow
		expect(
			httpRejected || bodyHasError || bodyNoSuccess,
			`Expected a rejection response (4xx, error body, or no success), got status=${publicRes.status()}, body=${JSON.stringify(body)}`
		).toBe(true);
	});

});
