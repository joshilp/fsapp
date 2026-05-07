/**
 * Channex.io channel manager API client.
 *
 * Channex is a certified channel manager that distributes your ARI (Availability,
 * Rates, Inventory) to Booking.com, Expedia, Airbnb, Google Hotels, and more.
 *
 * Setup: create a free account at https://channex.io, then:
 *   1. Create properties matching your PMS properties
 *   2. Create room types matching your PMS room types
 *   3. Create one rate plan per room type (e.g. "Standard")
 *   4. Connect OTA channels in the Channex dashboard (no code needed)
 *   5. Paste the UUIDs into Settings → Channels in this app
 *   6. Add your API key to CHANNEX_API_KEY in .env
 *
 * API reference: https://developers.channex.io
 */

import { env } from '$env/dynamic/private';

const BASE_URL = 'https://api.channex.io/api/v1';

export type ARIUpdate = {
	channexPropertyId: string;
	channexRoomTypeId: string;
	channexRatePlanId: string;
	dateFrom: string; // YYYY-MM-DD
	dateTo: string;   // YYYY-MM-DD (inclusive)
	availability?: number;
	rateCents?: number;       // null = don't update rate
	minNights?: number;
	stopSell?: boolean;
	closedToArrival?: boolean;
	closedToDeparture?: boolean;
};

export type ChannexBooking = {
	id: string;
	status: string;
	property_id: string;
	room_type_id: string;
	rate_plan_id: string;
	check_in: string;
	check_out: string;
	adults: number;
	children: number;
	currency: string;
	total_price: string;
	ota_name: string;         // e.g. "Booking.com"
	ota_reservation_code: string;
	customer: {
		name: string;
		email?: string;
		phone?: string;
	};
	notes?: string;
};

function apiKey(): string {
	const key = env.CHANNEX_API_KEY ?? '';
	return key;
}

function isConfigured(): boolean {
	return !!apiKey();
}

/**
 * Push ARI updates to Channex. Each entry covers a date range so you can
 * batch a full 60-day window in one call per room type.
 *
 * Returns true on success, false if Channex is not configured or the push fails.
 */
export async function pushARI(updates: ARIUpdate[]): Promise<boolean> {
	if (!isConfigured() || updates.length === 0) return false;

	// Channex ARI upload endpoint (v1)
	// Format: array of per-room-type-range updates
	const payload = {
		ari: updates.map((u) => {
			const entry: Record<string, unknown> = {
				property_id: u.channexPropertyId,
				room_type_id: u.channexRoomTypeId,
				rate_plan_id: u.channexRatePlanId,
				date_from: u.dateFrom,
				date_to: u.dateTo
			};
			if (u.availability !== undefined) entry.availability = u.availability;
			if (u.rateCents !== undefined) entry.rate = parseFloat((u.rateCents / 100).toFixed(2));
			if (u.minNights !== undefined) entry.min_stay_arrival = u.minNights;
			if (u.stopSell !== undefined) entry.stop_sell = u.stopSell;
			if (u.closedToArrival !== undefined) entry.closed_to_arrival = u.closedToArrival;
			if (u.closedToDeparture !== undefined) entry.closed_to_departure = u.closedToDeparture;
			return entry;
		})
	};

	try {
		const res = await fetch(`${BASE_URL}/ari_upload`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'user-api-key': apiKey()
			},
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const body = await res.text();
			console.error(`[channex] ARI push failed (${res.status}):`, body);
			return false;
		}
		return true;
	} catch (err) {
		console.error('[channex] ARI push error:', err);
		return false;
	}
}

/**
 * Validate a webhook signature from Channex.
 * Channex sends an X-Channex-Signature header with a SHA-256 HMAC of the body
 * using your webhook secret. Set CHANNEX_WEBHOOK_SECRET in .env.
 */
export async function verifyWebhookSignature(
	body: string,
	signature: string | null
): Promise<boolean> {
	const secret = env.CHANNEX_WEBHOOK_SECRET ?? '';
	if (!secret || !signature) return !secret; // if no secret configured, skip verification

	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		enc.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
	const hex = Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return hex === signature.replace('sha256=', '');
}
