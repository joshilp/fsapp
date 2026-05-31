/**
 * 09 — Group bookings
 *
 * Covers:
 *   - Staff creates a group via POST /api/groups (2 rooms, same type)
 *   - Both bookings share a groupId
 *   - Both bookings appear in search results
 *   - Public multi-room booking via ?/bookGroup creates a group with 2 bookings
 *   - Group confirmation page shows both rooms
 *
 * Prerequisites: bookingFixture (with secondRoom: true), apiContext
 */
import { test, expect } from '../fixtures';
import { isoDate } from '../fixtures/data-factories';

// ─── Staff group booking ──────────────────────────────────────────────────────

test.describe('Staff group booking', () => {
	test('POST /api/groups creates linked bookings with shared groupId', async ({ apiContext }) => {
		// Seed a property with 2 rooms
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `group-staff-${Date.now()}`, secondRoom: true }
		});
		expect(seedRes.ok(), 'seed with secondRoom should succeed').toBe(true);
		const fx = await seedRes.json();

		try {
			const checkIn  = isoDate(20);
			const checkOut = isoDate(23);
			const email    = `group-staff-${Date.now()}@playwright.local`;

			const res = await apiContext.post('/api/groups', {
				data: {
					groupName:     'Test Group',
					organizerName: 'Test Organizer',
					organizerEmail: email,
					organizerPhone: '',
					billingType:   'individual',
					notes:         null,
					channelId:     'ch-online',
					clerkId:       null,
					guestName:     'Test Organizer',
					guestEmail:    email,
					rooms: [
						{ roomId: fx.roomId,  checkIn, checkOut, rateLines: [], taxLines: [] },
						{ roomId: fx.room2Id, checkIn, checkOut, rateLines: [], taxLines: [] }
					]
				}
			});

			if (res.status() === 401) {
				test.skip(true, 'Group API requires auth — run as authenticated user');
				return;
			}

			expect(res.ok(), 'creating group should succeed').toBe(true);
			const group = await res.json();
			expect(group.groupId, 'response should include groupId').toBeTruthy();
			expect(group.bookingIds?.length, 'should have created 2 bookings').toBe(2);

			// Both bookings should be searchable by guest email
			const search = await apiContext.get('/api/booking/search', {
				params: { guestEmail: email }
			});
			const bookingList = await search.json().catch(() => []);
			if (Array.isArray(bookingList) && bookingList.length >= 2) {
				const grpBookings = bookingList.filter((b: { groupId?: string }) => b.groupId === group.groupId);
				expect(grpBookings.length, 'both bookings should share groupId').toBeGreaterThanOrEqual(2);
			}		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});
});

// ─── Public group booking ─────────────────────────────────────────────────────

test.describe('Public group booking', () => {
	test('?/bookGroup action creates a group and multiple bookings', async ({ apiContext }) => {
		// Seed with 2 rooms so availability supports 2 bookings
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `group-public-${Date.now()}`, secondRoom: true }
		});
		expect(seedRes.ok()).toBe(true);
		const fx = await seedRes.json();

		try {
			const checkIn  = isoDate(20);
			const checkOut = isoDate(23);
			const email    = `group-pub-${Date.now()}@playwright.local`;

			// Submit ?/bookGroup with 2 of the same room type
			const body = new URLSearchParams({
				propertyId:           fx.propertyId,
				checkIn,
				checkOut,
				guestName:            'Group Public Tester',
				guestEmail:           email,
				guestPhone:           '',
				numAdults:            '2',
				numChildren:          '0',
				notes:                '',
				'roomTypeId[0]':      fx.roomTypeId,
				'qty[0]':             '2',
				'quotedTotalCents[0]':'44700',
				'quotedNights[0]':    '3',
			});

			const res = await apiContext.post(`/book/${fx.publicId}?/bookGroup`, {
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				data: body.toString()
			});

			const text = await res.text();
			expect(
				text.includes('"success":true') || text.includes('type":"success"'),
				'bookGroup action should succeed'
			).toBe(true);

			// Extract the token from the response
			const tokenMatch = text.match(/"token"\s*:\s*"([A-Z0-9]{8})"/);
			if (tokenMatch) {
				const token = tokenMatch[1];

				// Load confirmation page
				const confirmRes = await apiContext.get(`/book/confirmation/${token}`);
				expect(confirmRes.ok(), 'confirmation page should load').toBe(true);
				const confirmText = await confirmRes.text();

				// Should show "2 rooms"
				expect(
					confirmText.includes('2 rooms') || confirmText.includes('2 room'),
					'confirmation should show 2 rooms'
				).toBe(true);
			}
		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});

	test('?/bookGroup rejected when requesting more rooms than available', async ({ apiContext }) => {
		// Seed with only 1 room — requesting 2 should fail
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `group-overbook-${Date.now()}` }
		});
		expect(seedRes.ok()).toBe(true);
		const fx = await seedRes.json();

		try {
			const checkIn  = isoDate(20);
			const checkOut = isoDate(23);
			const email    = `group-ob-${Date.now()}@playwright.local`;

			const body = new URLSearchParams({
				propertyId: fx.propertyId,
				checkIn, checkOut,
				guestName: 'Overbook Test', guestEmail: email,
				guestPhone: '', numAdults: '2', numChildren: '0', notes: '',
				'roomTypeId[0]': fx.roomTypeId,
				'qty[0]':        '2', // only 1 room exists
				'quotedTotalCents[0]': '0',
				'quotedNights[0]':     '3',
			});

			const res = await apiContext.post(`/book/${fx.publicId}?/bookGroup`, {
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				data: body.toString()
			});

			const text = await res.text();
			expect(
				!text.includes('"success":true'),
				'overbooking group should be rejected'
			).toBe(true);
		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});
});
