/**
 * Channex webhook parsing (API tests — no browser).
 *
 * Business scenario:
 *   Channex fires webhooks for three events: booking_new, booking_update,
 *   booking_cancel. Our webhook handler must correctly parse each and update
 *   the database. A parsing bug here means bookings from OTAs are silently
 *   lost or not cancelled.
 *
 * These tests also validate that the payloads our trigger endpoint sends match
 * the Channex webhook contract (validateWebhookEnvelope). This catches drift
 * between our mock and the real Channex format.
 *
 * Acceptance criteria:
 *   - booking_new: webhook returns { received: true }
 *   - booking_cancel: webhook returns { received: true }
 *   - All webhook payloads produced by our trigger pass the schema
 *   - Handler responds 200 (not 401/400/500) when CHANNEX_WEBHOOK_SECRET is unset
 *
 * Prerequisites:
 *   - CHANNEX_MOCK=true in .env
 *   - CHANNEX_WEBHOOK_SECRET must be empty (so signature check is skipped)
 *   - At least one property with channexPropertyId set
 */
import { test, expect } from '../fixtures';
import { createWebhookTrigger, isoDate } from '../fixtures/data-factories';
import { validateWebhookEnvelope } from '../schemas/channex.schema';

test.describe('Channex webhook parsing', () => {

	// Helper: build a minimal valid trigger payload using TEST_* env vars
	function getTriggerPayload(overrides = {}) {
		return createWebhookTrigger({
			channexPropertyId: process.env.TEST_CHANNEX_PROPERTY_ID ?? '',
			channexRoomTypeId: process.env.TEST_CHANNEX_ROOM_TYPE_ID ?? '',
			channexRatePlanId: process.env.TEST_CHANNEX_RATE_PLAN_ID ?? '',
			...overrides,
		});
	}

	test('booking_new webhook is accepted and returns { received: true }', async ({ apiContext }) => {
		const propId = process.env.TEST_CHANNEX_PROPERTY_ID;
		if (!propId) { test.skip(true, 'Channex IDs not configured'); return; }

		const res = await apiContext.post('/api/dev/channex-trigger', {
			data: getTriggerPayload({ checkIn: isoDate(30), checkOut: isoDate(33) })
		});

		expect(res.ok()).toBe(true);
		const body = await res.json();
		expect(body.result?.received, 'handler must return { received: true }').toBe(true);
	});

	test('the mock trigger produces a payload that matches the Channex webhook schema', async ({ apiContext }) => {
		const propId = process.env.TEST_CHANNEX_PROPERTY_ID;
		if (!propId) { test.skip(true, 'Channex IDs not configured'); return; }

		// Fire a trigger and inspect what we actually sent to our own webhook handler
		const res  = await apiContext.post('/api/dev/channex-trigger', { data: getTriggerPayload() });
		const body = await res.json() as { payload?: unknown };

		expect(body.payload, 'trigger response should include the fired payload').toBeTruthy();

		const errors = validateWebhookEnvelope(body.payload);
		expect(
			errors,
			`Trigger payload does not match Channex schema:\n${errors.join('\n')}`
		).toHaveLength(0);
	});

	test('webhook handler returns 401 when signature is wrong and secret is configured', async ({ apiContext }) => {
		// This test only runs if CHANNEX_WEBHOOK_SECRET is set in .env
		const secret = process.env.CHANNEX_WEBHOOK_SECRET;
		if (!secret) {
			test.skip(true, 'CHANNEX_WEBHOOK_SECRET not set — signature verification is inactive');
			return;
		}

		const rawPayload = JSON.stringify({ event: 'booking_new', booking: {} });

		const res = await apiContext.post('/api/channex/webhook', {
			headers: {
				'Content-Type': 'application/json',
				'x-channex-signature': 'sha256=invalidsignature',
			},
			data: rawPayload,
		});

		expect(res.status(), 'wrong signature should return 401').toBe(401);
	});

	test('webhook handler returns 200 with no signature when secret is not configured', async ({ apiContext }) => {
		// When CHANNEX_WEBHOOK_SECRET is empty, signature check is skipped (dev-friendly default)
		const secret = process.env.CHANNEX_WEBHOOK_SECRET;
		if (secret) {
			test.skip(true, 'CHANNEX_WEBHOOK_SECRET is set — this test is for unconfigured state');
			return;
		}

		// Send an unknown event — handler should still return 200 (acknowledges to prevent retries)
		const res = await apiContext.post('/api/channex/webhook', {
			headers: { 'Content-Type': 'application/json' },
			data: JSON.stringify({ event: 'unknown_future_event', booking: null }),
		});

		expect(res.status(), 'handler should acknowledge unknown events with 200').toBe(200);
	});

});
