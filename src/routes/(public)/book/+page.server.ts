import { fail } from '@sveltejs/kit';
import { eq, and, lt, gt, ne } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings, bookingChannels, bookingLineItems, guests, properties, roomTypes, rooms } from '$lib/server/db/schema';
import { sendGuestConfirmation, sendOperatorAlert } from '$lib/server/email';
import { env } from '$env/dynamic/private';

function randomToken(len = 8): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
	let out = '';
	for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
	return out;
}

export const load: PageServerLoad = async ({ url }) => {
	const today = new Date().toISOString().slice(0, 10);

	const properties = await db.query.properties.findMany({
		columns: { id: true, name: true, checkinTime: true, checkoutTime: true, cancellationPolicy: true }
	});

	// Room types per property for the type selector step
	const roomTypes = await db.query.roomTypes.findMany({
		columns: { id: true, propertyId: true, name: true, category: true, sortOrder: true },
		orderBy: (rt, { asc }) => [asc(rt.sortOrder)]
	});

	// Active rooms with type info for availability filtering
	const allRooms = await db.query.rooms.findMany({
		where: eq(rooms.isActive, true),
		with: { roomType: { columns: { id: true, name: true, category: true } } },
		columns: { id: true, propertyId: true, roomTypeId: true, numRooms: true, hasKitchen: true, kingBeds: true, queenBeds: true, doubleBeds: true, hasHideabed: true }
	});

	// Get rate tiers for each room type (for pricing display)
	const rateTiers = await db.query.rateTiers.findMany({
		with: { season: { columns: { name: true, colour: true, startDate: true, endDate: true } } },
		columns: { roomTypeId: true, nightlyRate: true }
	});
	const minRateByType = new Map<string, number>();
	for (const t of rateTiers) {
		const current = minRateByType.get(t.roomTypeId);
		if (current === undefined || t.nightlyRate < current) {
			minRateByType.set(t.roomTypeId, t.nightlyRate);
		}
	}

	return {
		today,
		properties,
		roomTypes,
		allRooms: allRooms.map(r => ({
			...r,
			minRateCents: r.roomTypeId ? (minRateByType.get(r.roomTypeId) ?? null) : null
		})),
		minRateByType: Object.fromEntries(minRateByType)
	};
};

export const actions: Actions = {
	book: async ({ request }) => {
		const fd = await request.formData();
		const get = (k: string) => (fd.get(k) as string | null)?.trim() ?? '';

		const propertyId = get('propertyId');
		const roomTypeId = get('roomTypeId');
		const checkIn = get('checkIn');
		const checkOut = get('checkOut');
		const guestName = get('guestName');
		const guestEmail = get('guestEmail');
		const guestPhone = get('guestPhone').replace(/\D/g, '');
		const numAdults = parseInt(get('numAdults') || '1', 10);
		const numChildren = parseInt(get('numChildren') || '0', 10);
		const notes = get('notes');
		const quotedTotalCents = parseInt(get('quotedTotalCents') || '0', 10);
		const quotedNights = parseInt(get('quotedNights') || '1', 10);

		// Validation
		const today = new Date().toISOString().slice(0, 10);
		if (!propertyId) return fail(400, { error: 'Please select a property.' });
		if (!roomTypeId) return fail(400, { error: 'Please select a room type.' });
		if (!checkIn || checkIn < today) return fail(400, { error: 'Check-in date must be today or later.' });
		if (!checkOut || checkOut <= checkIn) return fail(400, { error: 'Check-out must be after check-in.' });
		if (!guestName) return fail(400, { error: 'Your name is required.' });
		if (!guestEmail || !guestEmail.includes('@')) return fail(400, { error: 'A valid email is required.' });

		// Verify room type belongs to the selected property
		const roomType = await db.query.roomTypes.findFirst({
			where: (rt, { eq, and }) => and(eq(rt.id, roomTypeId), eq(rt.propertyId, propertyId)),
			columns: { id: true, name: true }
		});
		if (!roomType) return fail(400, { error: 'Invalid room type selection.' });

		// Check inventory: are there rooms of this type available for these dates?
		const propRoomsOfType = await db.query.rooms.findMany({
			where: (r, { eq, and }) => and(eq(r.propertyId, propertyId), eq(r.roomTypeId, roomTypeId), eq(r.isActive, true)),
			columns: { id: true }
		});
		if (propRoomsOfType.length === 0) {
			return fail(400, { error: 'No rooms of that type exist at this property.' });
		}
		const roomIds = propRoomsOfType.map(r => r.id);

		// Count how many of those rooms are blocked for any overlapping booking
		const conflictedIds = new Set(
			(await db
				.select({ roomId: bookings.roomId })
				.from(bookings)
				.where(
					and(
						lt(bookings.checkInDate, checkOut),
						gt(bookings.checkOutDate, checkIn),
						ne(bookings.status, 'cancelled')
					)
				)
			)
				.map(r => r.roomId)
				.filter((id): id is string => id !== null && roomIds.includes(id))
		);
		const availableCount = roomIds.length - conflictedIds.size;
		if (availableCount <= 0) {
			return fail(400, { error: 'Sorry, no rooms of that type are available for those dates. Please try different dates or another room type.' });
		}

		// Online channel
		const onlineCh = await db.query.bookingChannels.findFirst({
			where: eq(bookingChannels.name, 'Online'),
			columns: { id: true }
		});

		// Upsert guest
		let guest = await db.query.guests.findFirst({
			where: (g, { eq }) => eq(g.email, guestEmail),
			columns: { id: true }
		});
		if (!guest) {
			const [newGuest] = await db.insert(guests).values({
				name: guestName,
				email: guestEmail,
				phone: guestPhone || null
			}).returning({ id: guests.id });
			guest = newGuest;
		}

		// Create the booking (roomId null — operator assigns later)
		const token = randomToken(8);
		const [booking] = await db.insert(bookings).values({
			propertyId,
			roomId: null,
			requestedRoomTypeId: roomTypeId,
			guestId: guest.id,
			channelId: onlineCh?.id ?? null,
			status: 'confirmed',
			checkInDate: checkIn,
			checkOutDate: checkOut,
			numAdults,
			numChildren,
			notes: notes || null,
			publicToken: token
		}).returning({ id: bookings.id, publicToken: bookings.publicToken });

		// Save quoted rate as a line item — locked in at booking time so operator
		// always knows what the guest was shown, regardless of room assigned later
		if (quotedTotalCents > 0 && quotedNights > 0) {
			await db.insert(bookingLineItems).values({
				bookingId: booking.id,
				type: 'rate',
				label: `Room rate · ${quotedNights} night${quotedNights === 1 ? '' : 's'} (online booking)`,
				quantity: quotedNights,
				unitAmount: Math.round(quotedTotalCents / quotedNights),
				totalAmount: quotedTotalCents,
				sortOrder: 0
			});
		}

		// Send confirmation email to guest and alert to operator (non-blocking)
		const [propRow, typeRow] = await Promise.all([
			db.query.properties.findFirst({ where: eq(properties.id, propertyId), columns: { name: true } }),
			db.query.roomTypes.findFirst({ where: eq(roomTypes.id, roomTypeId), columns: { name: true } })
		]);
		const propName = propRow?.name ?? propertyId;
		const reqTypeName = typeRow?.name ?? null;
		const nights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
		const origin = env.ORIGIN ?? 'http://localhost:5173';
		const confirmUrl = `${origin}/book/confirmation/${token}`;

		void sendGuestConfirmation({
			guestName,
			guestEmail,
			propertyName: propName,
			checkInDate: checkIn,
			checkOutDate: checkOut,
			nights,
			requestedRoomType: reqTypeName,
			quotedTotalCents: quotedTotalCents > 0 ? quotedTotalCents : null,
			publicToken: token,
			confirmationUrl: confirmUrl
		});
		void sendOperatorAlert({
			guestName,
			guestEmail,
			propertyName: propName,
			checkInDate: checkIn,
			checkOutDate: checkOut,
			nights,
			requestedRoomType: reqTypeName,
			quotedTotalCents: quotedTotalCents > 0 ? quotedTotalCents : null,
			confirmationUrl: confirmUrl
		});

		return { success: true, token: booking.publicToken };
	}
};
