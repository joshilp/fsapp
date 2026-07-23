/**
 * Channex API contract schemas.
 *
 * These are the shapes Channex.io documents for their API. Our app must
 * produce/consume exactly these formats or OTA connections will break silently.
 *
 * Each schema is a plain TypeScript interface + a `validate()` function that
 * returns a list of human-readable errors. Tests call validate() and assert
 * the error list is empty.
 *
 * When Channex updates their API, update the schemas here first, then fix
 * the app code until tests pass again.
 *
 * Channex API reference: https://developers.channex.io
 */

// ─── Outbound: ARI upload entry (what we send to Channex) ────────────────────

export interface ChannexARIEntry {
	property_id: string;      // UUID of property in Channex
	room_type_id: string;     // UUID of room type in Channex
	rate_plan_id: string;     // UUID of rate plan in Channex
	date_from: string;        // YYYY-MM-DD
	date_to: string;          // YYYY-MM-DD (inclusive)
	availability?: number;    // integer >= 0
	rate?: number;            // float (dollars, NOT cents)
	min_stay_arrival?: number;// integer >= 1
	stop_sell?: boolean;
	closed_to_arrival?: boolean;
	closed_to_departure?: boolean;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Accept real UUIDs or DEV:-prefixed test IDs (e.g. "DEV:prop-test-123")
const UUID_LIKE = /^(?:DEV:[^\s]+|[0-9a-f-]{32,})$/i;

export function validateARIEntry(entry: unknown): string[] {
	const errors: string[] = [];
	if (typeof entry !== 'object' || entry === null) {
		return ['entry must be an object'];
	}
	const e = entry as Record<string, unknown>;

	if (!e.property_id  || typeof e.property_id  !== 'string' || !UUID_LIKE.test(e.property_id))
		errors.push('property_id must be a UUID string');
	if (!e.room_type_id || typeof e.room_type_id !== 'string' || !UUID_LIKE.test(e.room_type_id))
		errors.push('room_type_id must be a UUID string');
	if (!e.rate_plan_id || typeof e.rate_plan_id !== 'string' || !UUID_LIKE.test(e.rate_plan_id))
		errors.push('rate_plan_id must be a UUID string');
	if (!e.date_from || !ISO_DATE.test(String(e.date_from)))
		errors.push('date_from must be YYYY-MM-DD');
	if (!e.date_to   || !ISO_DATE.test(String(e.date_to)))
		errors.push('date_to must be YYYY-MM-DD');
	if (e.date_from && e.date_to && String(e.date_from) > String(e.date_to))
		errors.push('date_from must not be after date_to');
	if (e.availability !== undefined) {
		if (typeof e.availability !== 'number' || !Number.isInteger(e.availability) || e.availability < 0)
			errors.push('availability must be a non-negative integer');
	}
	if (e.rate !== undefined) {
		if (typeof e.rate !== 'number' || e.rate < 0 || e.rate > 99999)
			errors.push('rate must be a positive float (dollars, not cents) max 99999');
		// Catch the common bug of passing cents instead of dollars
		if (typeof e.rate === 'number' && e.rate > 9999)
			errors.push('rate looks like cents — Channex expects dollars (e.g. 149.00 not 14900)');
	}
	if (e.min_stay_arrival !== undefined) {
		if (typeof e.min_stay_arrival !== 'number' || !Number.isInteger(e.min_stay_arrival) || e.min_stay_arrival < 1)
			errors.push('min_stay_arrival must be an integer >= 1');
	}
	if (e.stop_sell !== undefined && typeof e.stop_sell !== 'boolean')
		errors.push('stop_sell must be boolean');
	if (e.closed_to_arrival !== undefined && typeof e.closed_to_arrival !== 'boolean')
		errors.push('closed_to_arrival must be boolean');
	if (e.closed_to_departure !== undefined && typeof e.closed_to_departure !== 'boolean')
		errors.push('closed_to_departure must be boolean');

	return errors;
}

// ─── Inbound: Channex booking (what Channex sends us via webhook) ─────────────

export interface ChannexBookingPayload {
	id: string;
	status: string;
	property_id: string;
	room_type_id: string;
	rate_plan_id: string;
	check_in: string;          // YYYY-MM-DD
	check_out: string;         // YYYY-MM-DD
	adults: number;
	children: number;
	currency: string;          // ISO 4217, e.g. "CAD"
	total_price: string;       // numeric string, e.g. "297.00"
	ota_name: string;          // e.g. "Booking.com"
	ota_reservation_code: string;
	customer: {
		name: string;
		email?: string | null;
		phone?: string | null;
	};
	notes?: string | null;
}

export function validateBookingPayload(payload: unknown): string[] {
	const errors: string[] = [];
	if (typeof payload !== 'object' || payload === null)
		return ['payload must be an object'];
	const p = payload as Record<string, unknown>;

	if (!p.property_id  || typeof p.property_id  !== 'string') errors.push('property_id required');
	if (!p.room_type_id || typeof p.room_type_id !== 'string') errors.push('room_type_id required');
	if (!p.rate_plan_id || typeof p.rate_plan_id !== 'string') errors.push('rate_plan_id required');
	if (!p.check_in  || !ISO_DATE.test(String(p.check_in)))   errors.push('check_in must be YYYY-MM-DD');
	if (!p.check_out || !ISO_DATE.test(String(p.check_out)))  errors.push('check_out must be YYYY-MM-DD');
	if (p.check_in && p.check_out && String(p.check_in) >= String(p.check_out))
		errors.push('check_in must be before check_out');
	if (typeof p.adults !== 'number' || p.adults < 1)         errors.push('adults must be >= 1');
	if (typeof p.children !== 'number' || p.children < 0)     errors.push('children must be >= 0');
	if (!p.ota_name || typeof p.ota_name !== 'string')         errors.push('ota_name required');
	if (!p.ota_reservation_code || typeof p.ota_reservation_code !== 'string')
		errors.push('ota_reservation_code required');

	const cust = p.customer as Record<string, unknown> | undefined;
	if (!cust || typeof cust !== 'object')                     errors.push('customer object required');
	else if (!cust.name || typeof cust.name !== 'string')      errors.push('customer.name required');

	return errors;
}

// ─── Inbound: Channex webhook envelope ───────────────────────────────────────

export type ChannexWebhookEvent = 'booking_new' | 'booking_update' | 'booking_cancel';

export function validateWebhookEnvelope(body: unknown): string[] {
	const errors: string[] = [];
	if (typeof body !== 'object' || body === null) return ['body must be an object'];
	const b = body as Record<string, unknown>;

	const validEvents: ChannexWebhookEvent[] = ['booking_new', 'booking_update', 'booking_cancel'];
	if (!b.event || !validEvents.includes(b.event as ChannexWebhookEvent))
		errors.push(`event must be one of: ${validEvents.join(', ')}`);
	if (!b.booking || typeof b.booking !== 'object')
		errors.push('booking object required');
	else
		errors.push(...validateBookingPayload(b.booking).map(e => `booking.${e}`));

	return errors;
}
