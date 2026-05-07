/**
 * POST /api/channex/webhook
 * Receives booking notifications from Channex (new, modified, cancelled).
 *
 * Channex sends a JSON payload with an event type and booking data.
 * We create/update/cancel the corresponding booking in our PMS.
 *
 * To register this webhook in Channex:
 *   Dashboard → Settings → Webhooks → Add Webhook
 *   URL: https://yourdomain.com/api/channex/webhook
 *   Events: booking_new, booking_update, booking_cancel
 *
 * Optionally set CHANNEX_WEBHOOK_SECRET in .env for signature verification.
 */
import { json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	bookings,
	bookingChannels,
	guests,
	properties,
	roomTypes
} from '$lib/server/db/schema';
import { verifyWebhookSignature, type ChannexBooking } from '$lib/server/channex';

export const POST: RequestHandler = async ({ request }) => {
	const rawBody = await request.text();
	const sig = request.headers.get('x-channex-signature');

	// Verify signature if secret is configured
	const valid = await verifyWebhookSignature(rawBody, sig);
	if (!valid) {
		console.warn('[channex webhook] Invalid signature');
		return json({ error: 'Invalid signature' }, { status: 401 });
	}

	let payload: { event: string; booking?: ChannexBooking; booking_id?: string };
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { event, booking } = payload;

	if (event === 'booking_new' || event === 'booking_update') {
		if (!booking) return json({ error: 'Missing booking' }, { status: 400 });
		await handleBookingUpsert(booking, event === 'booking_update');
	} else if (event === 'booking_cancel') {
		if (!booking) return json({ error: 'Missing booking' }, { status: 400 });
		await handleBookingCancel(booking);
	} else {
		// Unknown event — acknowledge to prevent retries
		console.log('[channex webhook] Unknown event:', event);
	}

	return json({ received: true });
};

async function handleBookingUpsert(chbk: ChannexBooking, isUpdate: boolean) {
	// Find which property matches by channexPropertyId
	const prop = await db.query.properties.findFirst({
		where: eq(properties.channexPropertyId, chbk.property_id)
	});
	if (!prop) {
		console.warn('[channex webhook] No property found for channexPropertyId:', chbk.property_id);
		return;
	}

	// Find which room type matches by channexRoomTypeId
	const rt = await db.query.roomTypes.findFirst({
		where: eq(roomTypes.channexRoomTypeId, chbk.room_type_id)
	});

	// Find or create the channel (e.g. "Booking.com")
	let channel = await db.query.bookingChannels.findFirst({
		where: eq(bookingChannels.name, chbk.ota_name)
	});
	if (!channel) {
		const [created] = await db.insert(bookingChannels).values({
			id: crypto.randomUUID(),
			name: chbk.ota_name,
			isOta: true,
			isActive: true,
			sortOrder: 99
		}).returning();
		channel = created;
	}

	// Find or create the guest
	const guestName = chbk.customer.name ?? 'OTA Guest';
	let guestId: string | null = null;
	if (chbk.customer.email) {
		const existing = await db.query.guests.findFirst({
			where: eq(guests.email, chbk.customer.email)
		});
		if (existing) {
			guestId = existing.id;
		} else {
			const [g] = await db.insert(guests).values({
				id: crypto.randomUUID(),
				name: guestName,
				email: chbk.customer.email,
				phone: chbk.customer.phone ?? null,
				updatedAt: new Date(),
				createdAt: new Date()
			}).returning();
			guestId = g.id;
		}
	} else {
		// No email — create anonymous guest
		const [g] = await db.insert(guests).values({
			id: crypto.randomUUID(),
			name: guestName,
			phone: chbk.customer.phone ?? null,
			updatedAt: new Date(),
			createdAt: new Date()
		}).returning();
		guestId = g.id;
	}

	if (isUpdate) {
		// Update existing booking by OTA confirmation number
		const existing = await db.query.bookings.findFirst({
			where: and(
				eq(bookings.otaConfirmationNumber, chbk.ota_reservation_code),
				eq(bookings.propertyId, prop.id)
			)
		});
		if (existing) {
			await db.update(bookings).set({
				checkInDate: chbk.check_in,
				checkOutDate: chbk.check_out,
				numAdults: chbk.adults,
				numChildren: chbk.children,
				notes: chbk.notes ?? existing.notes,
				updatedAt: new Date()
			}).where(eq(bookings.id, existing.id));
			return;
		}
	}

	// Create new booking (unassigned — room to be assigned by operator)
	await db.insert(bookings).values({
		id: crypto.randomUUID(),
		propertyId: prop.id,
		roomId: null, // unassigned — shows in "Unassigned Online Bookings"
		guestId,
		channelId: channel?.id ?? null,
		requestedRoomTypeId: rt?.id ?? null,
		checkInDate: chbk.check_in,
		checkOutDate: chbk.check_out,
		numAdults: chbk.adults,
		numChildren: chbk.children ?? 0,
		status: 'confirmed',
		otaConfirmationNumber: chbk.ota_reservation_code,
		notes: chbk.notes ?? null,
		updatedAt: new Date(),
		createdAt: new Date()
	});

	console.log(`[channex webhook] Created booking for ${guestName} (${chbk.ota_name} ${chbk.ota_reservation_code})`);
}

async function handleBookingCancel(chbk: ChannexBooking) {
	const existing = await db.query.bookings.findFirst({
		where: eq(bookings.otaConfirmationNumber, chbk.ota_reservation_code)
	});
	if (!existing) {
		console.warn('[channex webhook] Cannot cancel — booking not found:', chbk.ota_reservation_code);
		return;
	}
	await db.update(bookings).set({
		status: 'cancelled',
		cancelledAt: new Date(),
		updatedAt: new Date()
	}).where(eq(bookings.id, existing.id));
	console.log(`[channex webhook] Cancelled booking ${existing.id} (${chbk.ota_reservation_code})`);
}
