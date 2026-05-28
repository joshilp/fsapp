/**
 * Shared booking action used by both /book (generic) and /book/[publicId] (property-specific).
 * Handles validation, atomic availability check, and booking insertion.
 */
import { fail } from '@sveltejs/kit';
import { eq, and, lt, gt, ne, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bookings, bookingChannels, bookingLineItems, guests, promoCodes, properties, roomTypes, rooms, rateOverrides } from '$lib/server/db/schema';
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
	const promoCodeId      = get('promoCodeId') || null;

	const today = new Date().toISOString().slice(0, 10);
	if (!propertyId)  return fail(400, { error: 'Please select a property.' });
	if (!roomTypeId)  return fail(400, { error: 'Please select a room type.' });
	if (!checkIn || checkIn < today)       return fail(400, { error: 'Check-in date must be today or later.' });
	if (!checkOut || checkOut <= checkIn)  return fail(400, { error: 'Check-out must be after check-in.' });
	if (!guestName)   return fail(400, { error: 'Your name is required.' });
	if (!guestEmail || !guestEmail.includes('@')) return fail(400, { error: 'A valid email is required.' });

	const rt = await db.query.roomTypes.findFirst({
		where: and(eq(roomTypes.id, roomTypeId), eq(roomTypes.propertyId, propertyId)),
		columns: { id: true, name: true, parentRoomTypeId: true }
	});
	if (!rt) return fail(400, { error: 'Invalid room type selection.' });

	const stayNights = Math.round(
		(new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
	);

	// Pool root: child types borrow inventory from the parent
	const poolRootId = rt.parentRoomTypeId ?? roomTypeId;

	// ── Rate-override enforcement (stop-sell, closed-to-arrival, per-date min nights) ──
	const stayOverrides = await db.query.rateOverrides.findMany({
		where: and(
			eq(rateOverrides.roomTypeId, roomTypeId),
			gte(rateOverrides.date, checkIn),
			lt(rateOverrides.date, checkOut)
		),
		columns: { date: true, stopSell: true, closedToArrival: true, minNights: true }
	});
	// Also check parent overrides if this is a child
	const parentOverrides = rt.parentRoomTypeId
		? await db.query.rateOverrides.findMany({
			where: and(
				eq(rateOverrides.roomTypeId, rt.parentRoomTypeId),
				gte(rateOverrides.date, checkIn),
				lt(rateOverrides.date, checkOut)
			),
			columns: { date: true, stopSell: true, closedToArrival: true, minNights: true }
		})
		: [];
	const allOverrides = [...stayOverrides, ...parentOverrides];

	if (allOverrides.some((o) => o.stopSell)) {
		return fail(400, { error: 'Those dates are no longer available for online booking.' });
	}
	const checkInOverride = allOverrides.find((o) => o.date === checkIn);
	if (checkInOverride?.closedToArrival) {
		return fail(400, { error: 'Check-in is not available on that date. Please choose a different arrival date.' });
	}
	const maxOverrideMin = allOverrides.reduce((m, o) => Math.max(m, o.minNights ?? 1), 1);
	if (stayNights < maxOverrideMin) {
		return fail(400, { error: `A minimum ${maxOverrideMin}-night stay is required for those dates.` });
	}

	// ── Min-night enforcement (season level) ─────────────────────────────────
	const { rateSeasons, rateTiers } = await import('$lib/server/db/schema');
	const overlappingSeasons = await db.query.rateSeasons.findMany({
		where: and(
			eq(rateSeasons.propertyId, propertyId),
			lt(rateSeasons.startDate, checkOut),
			gt(rateSeasons.endDate, checkIn)
		),
		columns: { id: true, name: true },
		with: {
			tiers: {
				where: and(eq(rateTiers.roomTypeId, roomTypeId)),
				columns: { minNights: true }
			}
		}
	});
	for (const season of overlappingSeasons) {
		for (const tier of season.tiers) {
			if (tier.minNights && tier.minNights > 1 && stayNights < tier.minNights) {
				return fail(400, { error: `"${season.name}" requires a minimum ${tier.minNights}-night stay.` });
			}
		}
	}

	// ── Availability check ────────────────────────────────────────────────────
	// For child types, use the parent's physical rooms as the pool.
	const propRooms = await db.query.rooms.findMany({
		where: and(eq(rooms.propertyId, propertyId), eq(rooms.roomTypeId, poolRootId), eq(rooms.isActive, true)),
		columns: { id: true }
	});
	if (propRooms.length === 0) {
		return fail(400, { error: 'No rooms of that type exist at this property.' });
	}

	const roomIds    = propRooms.map((r) => r.id);
	const totalRooms = roomIds.length;

	const conflictedRoomIds = new Set(
		(await db.select({ roomId: bookings.roomId }).from(bookings).where(and(
			lt(bookings.checkInDate, checkOut), gt(bookings.checkOutDate, checkIn),
			ne(bookings.status, 'cancelled'), ne(bookings.status, 'blocked'),
			inArray(bookings.roomId, roomIds)
		))).map((r) => r.roomId).filter((id): id is string => id !== null)
	);

	const unassigned = await db.select({ roomTypeId: bookings.requestedRoomTypeId }).from(bookings).where(and(
		lt(bookings.checkInDate, checkOut), gt(bookings.checkOutDate, checkIn),
		ne(bookings.status, 'cancelled'), ne(bookings.status, 'blocked'),
		isNull(bookings.roomId), eq(bookings.propertyId, propertyId)
	));
	// Count unassigned bookings that consume the same pool (pool root + all children)
	const poolTypeIds = await db.query.roomTypes.findMany({
		where: eq(roomTypes.propertyId, propertyId),
		columns: { id: true, parentRoomTypeId: true }
	}).then((rts) => [poolRootId, ...rts.filter((r) => r.parentRoomTypeId === poolRootId).map((r) => r.id)]);
	const unassignedCount = unassigned.filter((u) => u.roomTypeId && poolTypeIds.includes(u.roomTypeId)).length;

	if (conflictedRoomIds.size + unassignedCount >= totalRooms) {
		return fail(400, { error: 'Sorry, no rooms of that type are available for those dates. Please try different dates or another room type.' });
	}

	// ── Create guest (find-or-create) and booking ─────────────────────────────
	let guest = await db.query.guests.findFirst({ where: eq(guests.email, guestEmail), columns: { id: true } });
	if (!guest) {
		const [g] = await db.insert(guests).values({ name: guestName, email: guestEmail, phone: guestPhone || null }).returning({ id: guests.id });
		guest = g;
	}

	const onlineCh = await db.query.bookingChannels.findFirst({ where: eq(bookingChannels.name, 'Online'), columns: { id: true } });

	const newToken = randomToken(8);
	let booking: { id: string; publicToken: string | null };
	try {
		const [b] = await db.insert(bookings).values({
			propertyId, roomId: null, requestedRoomTypeId: roomTypeId,
			guestId: guest.id, channelId: onlineCh?.id ?? null,
			status: 'confirmed', checkInDate: checkIn, checkOutDate: checkOut,
			numAdults, numChildren, notes: notes || null, publicToken: newToken,
			promoCodeId: promoCodeId || null
		}).returning({ id: bookings.id, publicToken: bookings.publicToken });
		booking = b;
	} catch {
		return fail(400, { error: 'Booking failed due to a conflict. Please try again.' });
	}

	// Increment promo code usage count
	if (promoCodeId) {
		await db.update(promoCodes)
			.set({ usedCount: sql`${promoCodes.usedCount} + 1` })
			.where(eq(promoCodes.id, promoCodeId));
	}

	if (quotedTotalCents > 0 && quotedNights > 0) {
		await db.insert(bookingLineItems).values({
			bookingId: booking.id, type: 'rate',
			label: `Room rate · ${quotedNights} night${quotedNights === 1 ? '' : 's'} (online booking)`,
			quantity: quotedNights,
			unitAmount: Math.round(quotedTotalCents / quotedNights),
			totalAmount: quotedTotalCents, sortOrder: 0
		});
	}

	const token = booking.publicToken!;

	// Side effects outside the transaction
	const [propRow, typeRow] = await Promise.all([
		db.query.properties.findFirst({ where: eq(properties.id, propertyId), columns: { name: true, emailNote: true, emailSignature: true } }),
		db.query.roomTypes.findFirst({ where: eq(roomTypes.id, roomTypeId), columns: { name: true } })
	]);
	const nights   = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	const origin   = env.ORIGIN ?? 'http://localhost:5173';
	const confirmUrl = `${origin}/book/confirmation/${token}`;

	void sendGuestConfirmation({ guestName, guestEmail, propertyName: propRow?.name ?? propertyId, checkInDate: checkIn, checkOutDate: checkOut, nights, requestedRoomType: typeRow?.name ?? null, quotedTotalCents: quotedTotalCents > 0 ? quotedTotalCents : null, publicToken: token, confirmationUrl: confirmUrl, emailNote: propRow?.emailNote ?? null, emailSignature: propRow?.emailSignature ?? null });
	void sendOperatorAlert({ guestName, guestEmail, propertyName: propRow?.name ?? propertyId, checkInDate: checkIn, checkOutDate: checkOut, nights, requestedRoomType: typeRow?.name ?? null, quotedTotalCents: quotedTotalCents > 0 ? quotedTotalCents : null, confirmationUrl: confirmUrl });

	// Re-sync availability with Channex for every night of the stay
	void syncARIForStay(roomTypeId, checkIn, checkOut).catch((e) => console.error('[ari-sync] public-book:', e));

	return { success: true, token };
}
