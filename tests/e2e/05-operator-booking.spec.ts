/**
 * Operator-created booking flow
 *
 * Business scenario:
 *   An operator manually creates a booking via the /api/booking endpoint
 *   (e.g., a walk-in or phone booking), then:
 *   - The booking appears on the grid (confirmed status)
 *   - The booking can be cancelled, which restores availability
 *
 * Uses the bookingFixture for an isolated test property.
 */
import { test, expect } from '../fixtures';

test.describe('Operator creates booking via API', () => {

	test('creates a confirmed booking with correct details', async ({ apiContext, bookingFixture }) => {
		const guestName  = `Operator Guest ${Date.now()}`;
		const guestEmail = `op+${Date.now()}@test.local`;

		const createRes = await apiContext.post('/api/booking', {
			data: {
				propertyId:  bookingFixture.propertyId,
				roomId:      bookingFixture.roomId,
				checkInDate:  bookingFixture.checkIn,
				checkOutDate: bookingFixture.checkOut,
				numAdults:    2,
				numChildren:  0,
				guestName,
				guestEmail,
				status:       'confirmed',
			}
		});
		expect(createRes.ok(), `create booking should succeed, got ${createRes.status()}`).toBe(true);

		const created = await createRes.json();
		expect(created.id, 'should return a booking id').toBeTruthy();

		// Verify via search
		const results = await (
			await apiContext.get('/api/booking/search', { params: { guestEmail } })
		).json();
		expect(results.length).toBeGreaterThan(0);

		const b = results[0];
		expect(b.status,     'should be confirmed').toBe('confirmed');
		expect(b.roomId,     'should have the room assigned').toBe(bookingFixture.roomId);
		expect(b.guestName,  'guest name should match').toBe(guestName);
		expect(b.guestEmail, 'guest email should match').toBe(guestEmail);
		expect(b.checkInDate).toBe(bookingFixture.checkIn);
		expect(b.checkOutDate).toBe(bookingFixture.checkOut);
	});

	test('duplicate room booking for same dates is rejected', async ({ apiContext, bookingFixture }) => {
		// Book the room once
		await apiContext.post('/api/booking', {
			data: {
				propertyId:   bookingFixture.propertyId,
				roomId:       bookingFixture.roomId,
				checkInDate:  bookingFixture.checkIn,
				checkOutDate: bookingFixture.checkOut,
				numAdults:    1, numChildren: 0,
				guestName:    'First Guest', guestEmail: `first+${Date.now()}@test.local`,
				status:       'confirmed',
			}
		});

		// Try to book the same room for overlapping dates
		const dupRes = await apiContext.post('/api/booking', {
			data: {
				propertyId:   bookingFixture.propertyId,
				roomId:       bookingFixture.roomId,
				checkInDate:  bookingFixture.checkIn,
				checkOutDate: bookingFixture.checkOut,
				numAdults:    1, numChildren: 0,
				guestName:    'Second Guest', guestEmail: `second+${Date.now()}@test.local`,
				status:       'confirmed',
			}
		});
		expect(dupRes.status(), 'should reject overlapping booking').toBe(409);
	});

	test('cancellation removes the booking from confirmed bookings', async ({ apiContext, bookingFixture }) => {
		const guestEmail = `cancel+${Date.now()}@test.local`;

		const createRes = await apiContext.post('/api/booking', {
			data: {
				propertyId:   bookingFixture.propertyId,
				roomId:       bookingFixture.roomId,
				checkInDate:  bookingFixture.checkIn,
				checkOutDate: bookingFixture.checkOut,
				numAdults: 1, numChildren: 0,
				guestName: 'Cancel Guest', guestEmail,
				status: 'confirmed',
			}
		});
		expect(createRes.ok()).toBe(true);
		const { id: bookingId } = await createRes.json();

		// Cancel
		const cancelRes = await apiContext.post(`/api/booking/${bookingId}/cancel`);
		expect(cancelRes.ok(), `cancel should succeed, got ${cancelRes.status()}`).toBe(true);

		// Verify status
		const after = await (
			await apiContext.get('/api/booking/search', { params: { guestEmail } })
		).json();
		expect(after[0].status, 'booking should be cancelled').toBe('cancelled');
	});

});
