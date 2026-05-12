/**
 * Shared booking action used by both /book (generic) and /book/[publicId] (property-specific).
 * Handles validation, atomic availability check, and booking insertion.
 */
import { fail } from '@sveltejs/kit';
import { eq, and, lt, gt, ne, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bookings, bookingChannels, bookingLineItems, guests, properties, roomTypes, rooms } from '$lib/server/db/schema';
import { sendGuestConfirmation, sendOperatorAlert } from '$lib/server/email';
import { env } from '$env/dynamic/private';
import { syncARIForStay } from '$lib/server/ari-sync';

function randomToken(len = 8): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let out = '';
	for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
	return out;
}

export async function bookAction(request: Request) {
	const fd = await request.formData();
	const get = (k: string) => (fd.get(k) as string | null)?.trim() ?? '';

	const propertyId       = get('propertyId');
	const roomTypeId       = get('roomTypeId');
	const checkIn          = get('checkIn');
	const checkOut         = get('checkOut');
	const guestName        = get('guestName');
	const guestEmail       = get('guestEmail');
	const guestPhone       = get('guestPhone').replace(/\D/g, '');
	const numAdults        = parseInt(get('numAdults')  || '1', 10);
	const numChildren      = parseInt(get('numChildren') || '0', 10);
	const notes            = get('notes');
	const quotedTotalCents = parseInt(get('quotedTotalCents') || '0', 10);
	const quotedNights     = parseInt(get('quotedNights') || '1', 10);

	const today = new Date().toISOString().slice(0, 10);
	if (!propertyId)  return fail(400, { error: 'Please select a property.' });
	if (!roomTypeId)  return fail(400, { error: 'Please select a room type.' });
	if (!checkIn || checkIn < today)       return fail(400, { error: 'Check-in date must be today or later.' });
	if (!checkOut || checkOut <= checkIn)  return fail(400, { error: 'Check-out must be after check-in.' });
	if (!guestName)   return fail(400, { error: 'Your name is required.' });
	if (!guestEmail || !guestEmail.includes('@')) return fail(400, { error: 'A valid email is required.' });

	const rt = await db.query.roomTypes.findFirst({
		where: and(eq(roomTypes.id, roomTypeId), eq(roomTypes.propertyId, propertyId)),
		columns: { id: true, name: true }
	});
	if (!rt) return fail(400, { error: 'Invalid room type selection.' });

	let token: string;
	try {
		token = await db.transaction(async (tx) => {
			const propRooms = await tx.query.rooms.findMany({
				where: and(eq(rooms.propertyId, propertyId), eq(rooms.roomTypeId, roomTypeId), eq(rooms.isActive, true)),
				columns: { id: true }
			});
			if (propRooms.length === 0) throw new Error('No rooms of that type exist at this property.');

			const roomIds    = propRooms.map((r) => r.id);
			const totalRooms = roomIds.length;

			const conflictedRoomIds = new Set(
				(await tx.select({ roomId: bookings.roomId }).from(bookings).where(and(
					lt(bookings.checkInDate, checkOut), gt(bookings.checkOutDate, checkIn),
					ne(bookings.status, 'cancelled'), ne(bookings.status, 'blocked'),
					inArray(bookings.roomId, roomIds)
				))).map((r) => r.roomId).filter((id): id is string => id !== null)
			);

			const unassigned = await tx.select({ id: bookings.id }).from(bookings).where(and(
				lt(bookings.checkInDate, checkOut), gt(bookings.checkOutDate, checkIn),
				ne(bookings.status, 'cancelled'), ne(bookings.status, 'blocked'),
				isNull(bookings.roomId), eq(bookings.requestedRoomTypeId, roomTypeId)
			));

			if (conflictedRoomIds.size + unassigned.length >= totalRooms) {
				throw new Error('Sorry, no rooms of that type are available for those dates. Please try different dates or another room type.');
			}

			let guest = await tx.query.guests.findFirst({ where: eq(guests.email, guestEmail), columns: { id: true } });
			if (!guest) {
				const [g] = await tx.insert(guests).values({ name: guestName, email: guestEmail, phone: guestPhone || null }).returning({ id: guests.id });
				guest = g;
			}

			const onlineCh = await tx.query.bookingChannels.findFirst({ where: eq(bookingChannels.name, 'Online'), columns: { id: true } });

			const newToken = randomToken(8);
			const [booking] = await tx.insert(bookings).values({
				propertyId, roomId: null, requestedRoomTypeId: roomTypeId,
				guestId: guest.id, channelId: onlineCh?.id ?? null,
				status: 'confirmed', checkInDate: checkIn, checkOutDate: checkOut,
				numAdults, numChildren, notes: notes || null, publicToken: newToken
			}).returning({ id: bookings.id, publicToken: bookings.publicToken });

			if (quotedTotalCents > 0 && quotedNights > 0) {
				await tx.insert(bookingLineItems).values({
					bookingId: booking.id, type: 'rate',
					label: `Room rate · ${quotedNights} night${quotedNights === 1 ? '' : 's'} (online booking)`,
					quantity: quotedNights,
					unitAmount: Math.round(quotedTotalCents / quotedNights),
					totalAmount: quotedTotalCents, sortOrder: 0
				});
			}

			return booking.publicToken!;
		});
	} catch (err) {
		return fail(400, { error: err instanceof Error ? err.message : 'Booking failed. Please try again.' });
	}

	// Side effects outside the transaction
	const [propRow, typeRow] = await Promise.all([
		db.query.properties.findFirst({ where: eq(properties.id, propertyId), columns: { name: true } }),
		db.query.roomTypes.findFirst({ where: eq(roomTypes.id, roomTypeId), columns: { name: true } })
	]);
	const nights   = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	const origin   = env.ORIGIN ?? 'http://localhost:5173';
	const confirmUrl = `${origin}/book/confirmation/${token}`;

	void sendGuestConfirmation({ guestName, guestEmail, propertyName: propRow?.name ?? propertyId, checkInDate: checkIn, checkOutDate: checkOut, nights, requestedRoomType: typeRow?.name ?? null, quotedTotalCents: quotedTotalCents > 0 ? quotedTotalCents : null, publicToken: token, confirmationUrl: confirmUrl });
	void sendOperatorAlert({ guestName, guestEmail, propertyName: propRow?.name ?? propertyId, checkInDate: checkIn, checkOutDate: checkOut, nights, requestedRoomType: typeRow?.name ?? null, quotedTotalCents: quotedTotalCents > 0 ? quotedTotalCents : null, confirmationUrl: confirmUrl });

	// Re-sync availability with Channex for every night of the stay
	void syncARIForStay(roomTypeId, checkIn, checkOut).catch(() => {});

	return { success: true, token };
}
