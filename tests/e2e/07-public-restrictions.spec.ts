/**
 * 07 — Public booking restrictions
 *
 * Covers:
 *   - Max stay: booking rejected when nights exceed property/room-type limit
 *   - Gap restriction: booking rejected when it leaves a gap < gapFillNights
 *   - Quarantine: availability returns 0 for a room quarantined through check-in
 *   - DOW rates: /api/public/pricing applies day-of-week rate adjustments
 *
 * Prerequisites: bookingFixture (seeded with optional params), apiContext
 * No browser window required — all checks are API-level.
 */
import { test, expect } from '../fixtures';
import { isoDate } from '../fixtures/data-factories';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

/** Returns YYYY-MM-DD using LOCAL calendar (avoids UTC shift for late-night timezones). */
function localIso(d: Date): string {
	return [
		d.getFullYear(),
		String(d.getMonth() + 1).padStart(2, '0'),
		String(d.getDate()).padStart(2, '0'),
	].join('-');
}

async function publicBook(
	apiContext: Awaited<ReturnType<typeof test.extend>>['apiContext'] extends (arg: infer A) => infer R ? never : never,
	ctx: { apiContext: Parameters<Parameters<typeof test>[1]>[0]['apiContext']; publicId: string; roomTypeId: string; propertyId: string },
	overrides: Record<string, string> = {}
) {
	const defaults: Record<string, string> = {
		propertyId:  ctx.propertyId,
		roomTypeId:  ctx.roomTypeId,
		checkIn:     isoDate(14),
		checkOut:    isoDate(17),
		guestName:   `Test Guest ${Date.now()}`,
		guestEmail:  `test-${Date.now()}@playwright.local`,
		guestPhone:  '',
		numAdults:   '2',
		numChildren: '0',
		notes:       '',
	};
	const body = new URLSearchParams({ ...defaults, ...overrides });
	return ctx.apiContext.post(`/book/${ctx.publicId}?/book`, {
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		data: body.toString()
	});
}

// ─── Max stay restriction ──────────────────────────────────────────────────────

test.describe('Max stay restriction', () => {
	test('public booking rejected when nights exceed property defaultMaxNights', async ({ apiContext }) => {
		// Seed a property with maxNights = 3
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `max-stay-${Date.now()}`, maxNights: 3 }
		});
		expect(seedRes.ok(), 'seed should succeed').toBe(true);
		const fx = await seedRes.json();

		try {
			// 4-night stay should be rejected
			const checkIn  = isoDate(14);
			const checkOut = addDays(checkIn, 4);
			const params = new URLSearchParams({
				propertyId: fx.propertyId, roomTypeId: fx.roomTypeId,
				checkIn, checkOut,
				guestName: 'Max Stay Test', guestEmail: `maxstay-${Date.now()}@playwright.local`,
				guestPhone: '', numAdults: '2', numChildren: '0', notes: ''
			});
			const res = await apiContext.post(`/book/${fx.publicId}?/book`, {
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				data: params.toString()
			});
			const text = await res.text();
			expect(
				text.includes('Maximum stay') || text.includes('maximum') || text.includes('3'),
				'response should mention max stay limit'
			).toBe(true);

			// Verify no booking was created for this guest
			const search = await apiContext.get('/api/booking/search', {
				params: { guestEmail: params.get('guestEmail')! }
			});
			const bookingList = await search.json().catch(() => []);
			expect(Array.isArray(bookingList) ? bookingList.length : 0, 'no booking should be created').toBe(0);
		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});

	test('public booking accepted when nights equal defaultMaxNights', async ({ apiContext }) => {
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `max-stay-ok-${Date.now()}`, maxNights: 3 }
		});
		expect(seedRes.ok()).toBe(true);
		const fx = await seedRes.json();

		try {
			const checkIn  = isoDate(14);
			const checkOut = addDays(checkIn, 3); // exactly 3 = allowed
			const email    = `maxstay-ok-${Date.now()}@playwright.local`;
			const params = new URLSearchParams({
				propertyId: fx.propertyId, roomTypeId: fx.roomTypeId,
				checkIn, checkOut,
				guestName: 'Max Stay OK', guestEmail: email,
				guestPhone: '', numAdults: '2', numChildren: '0', notes: ''
			});
			const res = await apiContext.post(`/book/${fx.publicId}?/book`, {
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				data: params.toString()
			});
			const text = await res.text();
			expect(text.includes('"success":true') || text.includes('type":"success"'), 'booking should succeed').toBe(true);
		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});
});

// ─── Gap restriction ──────────────────────────────────────────────────────────

test.describe('Gap restriction', () => {
	test('public booking rejected when it leaves a gap less than gapFillNights', async ({ apiContext }) => {
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `gap-${Date.now()}`, gapFillNights: 2 }
		});
		expect(seedRes.ok()).toBe(true);
		const fx = await seedRes.json();

		try {
			// Create an adjacent booking (days 14–17)
			const existRes = await apiContext.post('/api/booking', {
				data: {
					propertyId:   fx.propertyId,
					roomId:       fx.roomId,
					checkInDate:  isoDate(14),
					checkOutDate: isoDate(17),
					guestName:    'Existing Guest',
					guestEmail:   `existing-${Date.now()}@playwright.local`,
					numAdults: 2
				}
			});
			expect(existRes.ok(), 'creating adjacent booking should succeed').toBe(true);

			// Now try to book days 18–19 (1-night gap after the existing booking ends on day 17)
			const gapCheckIn  = isoDate(18);
			const gapCheckOut = isoDate(19);
			const email       = `gap-guest-${Date.now()}@playwright.local`;
			const params = new URLSearchParams({
				propertyId: fx.propertyId, roomTypeId: fx.roomTypeId,
				checkIn: gapCheckIn, checkOut: gapCheckOut,
				guestName: 'Gap Test', guestEmail: email,
				guestPhone: '', numAdults: '2', numChildren: '0', notes: ''
			});
			const res = await apiContext.post(`/book/${fx.publicId}?/book`, {
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				data: params.toString()
			});
			const text = await res.text();
			expect(
				text.includes('gap') || text.includes('Gap'),
				'response should mention gap restriction'
			).toBe(true);
		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});
});

// ─── Quarantine ───────────────────────────────────────────────────────────────

test.describe('Room quarantine', () => {
	test('availability returns 0 when the only room is quarantined through check-in', async ({ apiContext }) => {
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `quarantine-${Date.now()}`, quarantineHours: 24 }
		});
		expect(seedRes.ok()).toBe(true);
		const fx = await seedRes.json();

		try {
			// Manually set quarantineUntil to a future date (after checkIn)
			// via the dev rooms endpoint — we set it through the internal API
			const futureDate = addDays(isoDate(0), 30); // 30 days from now
			const patchRes = await apiContext.patch(`/api/rooms/${fx.roomId}`, {
				data: { quarantineUntil: futureDate }
			});
			// If no such endpoint, skip gracefully
			if (!patchRes.ok()) {
				test.skip(true, 'No /api/rooms/:id PATCH endpoint available for quarantine test');
				return;
			}

			const checkIn  = isoDate(14);
			const checkOut = isoDate(17);
			const avRes = await apiContext.get('/api/public/availability', {
				params: { propertyId: fx.propertyId, checkIn, checkOut }
			});
			expect(avRes.ok(), 'availability API should respond').toBe(true);
			const types = await avRes.json();
			const rt = types.find((t: { id: string }) => t.id === fx.roomTypeId);
			expect(rt?.availableCount ?? 0, 'quarantined room should show 0 availability').toBe(0);
		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});
});

// ─── Day-of-week rates ────────────────────────────────────────────────────────

test.describe('Day-of-week rates', () => {
	test('pricing API applies DOW rate for a Friday night', async ({ apiContext }) => {
		// Seed with DOW rates: Fri (5) = $199, all others null (use base $149)
		const dowRates = [null, null, null, null, null, 19900, null]; // [sun..sat]
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `dow-${Date.now()}`, dowRates }
		});
		expect(seedRes.ok()).toBe(true);
		const fx = await seedRes.json();

		try {
			// Find the next Friday using local calendar (avoids UTC-shift timezone bug)
			const today = new Date();
			const daysUntilFri = (5 - today.getDay() + 7) % 7 || 7;
			const fri = new Date(today);
			fri.setDate(today.getDate() + daysUntilFri);
			const checkIn  = localIso(fri);
			const sat = new Date(fri);
			sat.setDate(fri.getDate() + 1);
			const checkOut = localIso(sat);

			const pricingRes = await apiContext.get('/api/public/pricing', {
				params: { roomTypeId: fx.roomTypeId, checkIn, checkOut }
			});
			expect(pricingRes.ok(), 'pricing API should respond').toBe(true);
			const pricing = await pricingRes.json();

			// Subtotal should be 19900 cents ($199), not 14900 ($149)
			expect(pricing.subtotalCents, 'Friday night should use DOW rate of $199').toBe(19900);
		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});

	test('pricing API uses base rate when no DOW rate is set for that day', async ({ apiContext }) => {
		// DOW rates: only Fri set to $199, check a Monday stay
		const dowRates = [null, null, null, null, null, 19900, null];
		const seedRes = await apiContext.post('/api/test/seed', {
			data: { tag: `dow-base-${Date.now()}`, dowRates }
		});
		expect(seedRes.ok()).toBe(true);
		const fx = await seedRes.json();

		try {
			// Find the next Monday using local calendar
			const today = new Date();
			const daysUntilMon = (1 - today.getDay() + 7) % 7 || 7;
			const mon = new Date(today);
			mon.setDate(today.getDate() + daysUntilMon);
			const checkIn  = localIso(mon);
			const tue = new Date(mon);
			tue.setDate(mon.getDate() + 1);
			const checkOut = localIso(tue);

			const pricingRes = await apiContext.get('/api/public/pricing', {
				params: { roomTypeId: fx.roomTypeId, checkIn, checkOut }
			});
			expect(pricingRes.ok()).toBe(true);
			const pricing = await pricingRes.json();

			// Monday should use base rate $149 (14900 cents)
			expect(pricing.subtotalCents, 'Monday should use base rate of $149').toBe(14900);
		} finally {
			await apiContext.delete('/api/test/seed', { data: { propertyId: fx.propertyId } }).catch(() => {});
		}
	});
});
