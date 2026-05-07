import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * POST /api/dev/channex-trigger
 * Fires a simulated Channex webhook (booking_new / booking_cancel) at the
 * app's own webhook handler, allowing end-to-end testing without a real
 * Channex account.
 *
 * Body:
 *   event           'booking_new' | 'booking_cancel'
 *   channexPropertyId  string
 *   channexRoomTypeId  string
 *   channexRatePlanId  string
 *   checkIn            YYYY-MM-DD
 *   checkOut           YYYY-MM-DD
 *   adults             number  (default 1)
 *   children           number  (default 0)
 *   guestName          string
 *   guestEmail         string  (optional)
 *   guestPhone         string  (optional)
 *   otaName            string  (default 'Test OTA')
 *   totalPrice         string  (default '0.00')
 *   notes              string  (optional)
 *   otaRef             string  (optional — auto-generated if omitted)
 */
export const POST: RequestHandler = async ({ request, fetch }) => {
	const body = await request.json();

	const otaRef = body.otaRef || `MOCK-${Date.now()}`;

	const webhookPayload =
		body.event === 'booking_cancel'
			? {
					event: 'booking_cancel',
					booking: {
						id: crypto.randomUUID(),
						status: 'cancelled',
						property_id: body.channexPropertyId,
						room_type_id: body.channexRoomTypeId,
						rate_plan_id: body.channexRatePlanId,
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
					}
				}
			: {
					event: 'booking_new',
					booking: {
						id: crypto.randomUUID(),
						status: 'new',
						property_id: body.channexPropertyId,
						room_type_id: body.channexRoomTypeId,
						rate_plan_id: body.channexRatePlanId,
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
					}
				};

	const res = await fetch('/api/channex/webhook', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(webhookPayload)
	});

	const result = await res.json().catch(() => ({}));
	return json({ ok: res.ok, status: res.status, result, payload: webhookPayload });
};
