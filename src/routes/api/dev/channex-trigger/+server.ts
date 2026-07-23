/**
 * POST /api/dev/channex-trigger
 * Fires a simulated Channex webhook (booking_new / booking_update / booking_cancel) at the
 * app's own webhook handler, allowing end-to-end testing without a real
 * Channex account or any Channex IDs configured.
 *
 * Accepts EITHER:
 *   channexPropertyId + channexRoomTypeId + channexRatePlanId  (real Channex UUIDs)
 * OR:
 *   propertyId + roomTypeId  (internal DB IDs — used when no Channex IDs are set)
 *
 * When using internal IDs the trigger embeds them directly in the webhook
 * payload and the webhook handler will match by internal ID as a dev fallback.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, fetch }) => {
	const body = await request.json();

	const otaRef = body.otaRef || `MOCK-${Date.now()}`;

	// Use Channex IDs if provided, otherwise fall back to internal IDs
	// (the webhook handler accepts both via DEV_INTERNAL_ID: prefix)
	const propId  = body.channexPropertyId  || `DEV:${body.propertyId}`;
	const rtId    = body.channexRoomTypeId  || `DEV:${body.roomTypeId}`;
	const rateId  = body.channexRatePlanId  || 'DEV:rate';

	const shared = {
		id: crypto.randomUUID(),
		property_id: propId,
		room_type_id: rtId,
		rate_plan_id: rateId,
		check_in: body.checkIn,
		check_out: body.checkOut,
		adults: body.adults ?? 1,
		children: body.children ?? 0,
		currency: 'CAD',
		total_price: body.totalPrice ?? '0.00',
		ota_name: body.otaName ?? 'Test OTA',
		ota_reservation_code: otaRef,
		customer: { name: body.guestName ?? 'Test Guest', email: body.guestEmail ?? null, phone: body.guestPhone ?? null },
		notes: body.notes ?? null
	};

	const webhookPayload =
		body.event === 'booking_cancel'
			? { event: 'booking_cancel', booking: { ...shared, status: 'cancelled' } }
		: body.event === 'booking_update'
			? { event: 'booking_update', booking: { ...shared, status: 'modified' } }
			: { event: 'booking_new',    booking: { ...shared, status: 'new' } };

	const res = await fetch('/api/channex/webhook', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(webhookPayload)
	});

	const result = await res.json().catch(() => ({}));
	return json({ ok: res.ok, status: res.status, result, payload: webhookPayload });
};
