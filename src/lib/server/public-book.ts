/**
 * Shared booking action used by both /book (generic) and /book/[publicId] (property-specific).
 * Handles validation, atomic availability check, and booking insertion.
 */
import { fail } from '@sveltejs/kit';
import { eq, and, lt, gt, ne, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bookings, bookingChannels, bookingLineItems, groups, guests, promoCodes, properties, roomTypes, rooms, rateOverrides, rateSeasons } from '$lib/server/db/schema';
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
		columns: { id: true, name: true, parentRoomTypeId: true, maxNights: true }
	});
	if (!rt) return fail(400, { error: 'Invalid room type selection.' });

	const stayNights = Math.round(
		(new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
	);

	// ── Max stay enforcement ──────────────────────────────────────────────────
	// Check room-type-level override first, then property-level default
	const propRow = await db.query.properties.findFirst({
		where: eq(properties.id, propertyId),
		columns: { defaultMaxNights: true, gapFillNights: true }
	});
	const effectiveMaxNights = rt.maxNights ?? propRow?.defaultMaxNights ?? null;
	if (effectiveMaxNights !== null && stayNights > effectiveMaxNights) {
		return fail(400, { error: `Maximum stay is ${effectiveMaxNights} nights for this room type.` });
	}

	// Pool root: child types borrow inventory from the parent
	const poolRootId = rt.parentRoomTypeId ?? roomTypeId;

	// ── Rate-override enforcement (stop-sell, closed-to-arrival, CTD, per-date min nights) ──
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

	// CTD: check the checkout date itself (not included in the stay range above)
	const checkOutOverride = await db.query.rateOverrides.findFirst({
		where: and(eq(rateOverrides.roomTypeId, roomTypeId), eq(rateOverrides.date, checkOut)),
		columns: { closedToDeparture: true }
	});
	const parentCheckOutOverride = rt.parentRoomTypeId
		? await db.query.rateOverrides.findFirst({
			where: and(eq(rateOverrides.roomTypeId, rt.parentRoomTypeId), eq(rateOverrides.date, checkOut)),
			columns: { closedToDeparture: true }
		})
		: null;
	if (checkOutOverride?.closedToDeparture || parentCheckOutOverride?.closedToDeparture) {
		return fail(400, { error: 'Check-out is not available on that date. Please choose a different departure date.' });
	}

	const maxOverrideMin = allOverrides.reduce((m, o) => Math.max(m, o.minNights ?? 1), 1);
	if (stayNights < maxOverrideMin) {
		return fail(400, { error: `A minimum ${maxOverrideMin}-night stay is required for those dates.` });
	}

	// ── Min-night enforcement (season level) ─────────────────────────────────
	const overlappingSeasons = await db.query.rateSeasons.findMany({
		where: and(
			eq(rateSeasons.propertyId, propertyId),
			lt(rateSeasons.startDate, checkOut),
			gt(rateSeasons.endDate, checkIn)
		),
		columns: { id: true, name: true, minNights: true }
	});
	for (const season of overlappingSeasons) {
		if (season.minNights && season.minNights > 1 && stayNights < season.minNights) {
			return fail(400, { error: `"${season.name}" requires a minimum ${season.minNights}-night stay.` });
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

	// ── Gap fill check ────────────────────────────────────────────────────────
	// Block bookings that would leave a gap shorter than gapFillNights nights
	// between this booking and an adjacent booking for the same pool.
	const gapFillNights = propRow?.gapFillNights ?? 0;
	if (gapFillNights > 0) {
		// Compute checkIn - gapFillNights and checkOut + gapFillNights windows
		const gapCheckStart = new Date(checkIn + 'T12:00:00');
		gapCheckStart.setDate(gapCheckStart.getDate() - gapFillNights);
		const gapWindowStart = gapCheckStart.toISOString().slice(0, 10);
		const gapCheckEnd = new Date(checkOut + 'T12:00:00');
		gapCheckEnd.setDate(gapCheckEnd.getDate() + gapFillNights);
		const gapWindowEnd = gapCheckEnd.toISOString().slice(0, 10);

		// Find adjacent bookings within the gap window
		const adjacentBookings = await db.select({
			checkInDate: bookings.checkInDate,
			checkOutDate: bookings.checkOutDate
		}).from(bookings).where(and(
			ne(bookings.status, 'cancelled'), ne(bookings.status, 'blocked'),
			lt(bookings.checkInDate, gapWindowEnd),
			gt(bookings.checkOutDate, gapWindowStart),
			inArray(bookings.roomId, roomIds)
		));

		for (const adj of adjacentBookings) {
			// Gap BEFORE: existing booking ends just before our checkIn
			if (adj.checkOutDate <= checkIn && adj.checkOutDate > gapWindowStart) {
				const gapDays = Math.round((new Date(checkIn + 'T12:00:00').getTime() - new Date(adj.checkOutDate + 'T12:00:00').getTime()) / 86400000);
				if (gapDays > 0 && gapDays < gapFillNights) {
					return fail(400, { error: `Those dates would leave a ${gapDays}-night gap before this booking. Minimum gap is ${gapFillNights} nights.` });
				}
			}
			// Gap AFTER: existing booking starts just after our checkOut
			if (adj.checkInDate >= checkOut && adj.checkInDate < gapWindowEnd) {
				const gapDays = Math.round((new Date(adj.checkInDate + 'T12:00:00').getTime() - new Date(checkOut + 'T12:00:00').getTime()) / 86400000);
				if (gapDays > 0 && gapDays < gapFillNights) {
					return fail(400, { error: `Those dates would leave a ${gapDays}-night gap after this booking. Minimum gap is ${gapFillNights} nights.` });
				}
			}
		}
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
	const [typeRow] = await Promise.all([
		db.query.roomTypes.findFirst({ where: eq(roomTypes.id, roomTypeId), columns: { name: true } })
	]);
	const propData = await db.query.properties.findFirst({ where: eq(properties.id, propertyId), columns: { name: true, emailNote: true, emailSignature: true } });
	const nights   = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
	const origin   = env.ORIGIN ?? 'http://localhost:5173';
	const confirmUrl = `${origin}/book/confirmation/${token}`;

	void sendGuestConfirmation({ guestName, guestEmail, propertyName: propData?.name ?? propertyId, checkInDate: checkIn, checkOutDate: checkOut, nights, requestedRoomType: typeRow?.name ?? null, quotedTotalCents: quotedTotalCents > 0 ? quotedTotalCents : null, publicToken: token, confirmationUrl: confirmUrl, emailNote: propData?.emailNote ?? null, emailSignature: propData?.emailSignature ?? null });
	void sendOperatorAlert({ guestName, guestEmail, propertyName: propData?.name ?? propertyId, checkInDate: checkIn, checkOutDate: checkOut, nights, requestedRoomType: typeRow?.name ?? null, quotedTotalCents: quotedTotalCents > 0 ? quotedTotalCents : null, confirmationUrl: confirmUrl });

	// Re-sync availability with Channex for every night of the stay
	void syncARIForStay(roomTypeId, checkIn, checkOut).catch((e) => console.error('[ari-sync] public-book:', e));

	return { success: true, token };
}

// ─── Group booking action ─────────────────────────────────────────────────────

/**
 * Public multi-room group booking.
 * Accepts N room types (roomTypeId[i], qty[i]) sharing a single guest, dates, and notes.
 * Runs the same validation as bookAction per-type, then atomically creates a groups row
 * and one booking per room slot.
 * Returns { success: true, token } where token is the first booking's publicToken.
 */
export async function bookGroupAction(request: Request) {
	const fd  = await request.formData();
	const get = (k: string) => (fd.get(k) as string | null)?.trim() ?? '';

	const propertyId  = get('propertyId');
	const checkIn     = get('checkIn');
	const checkOut    = get('checkOut');
	const guestName   = get('guestName');
	const guestEmail  = get('guestEmail');
	const guestPhone  = get('guestPhone').replace(/\D/g, '');
	const numAdults   = parseInt(get('numAdults')   || '2', 10);
	const numChildren = parseInt(get('numChildren') || '0', 10);
	const notes       = get('notes');

	// Parse items: roomTypeId[0], qty[0], quotedTotalCents[0], quotedNights[0], …
	const items: { roomTypeId: string; qty: number; quotedTotalCents: number; quotedNights: number }[] = [];
	for (let i = 0; ; i++) {
		const typeId = (fd.get(`roomTypeId[${i}]`) as string | null)?.trim();
		if (!typeId) break;
		items.push({
			roomTypeId: typeId,
			qty: Math.max(1, parseInt((fd.get(`qty[${i}]`) as string | null) || '1', 10)),
			quotedTotalCents: parseInt((fd.get(`quotedTotalCents[${i}]`) as string | null) || '0', 10),
			quotedNights: parseInt((fd.get(`quotedNights[${i}]`) as string | null) || '1', 10)
		});
	}
	if (items.length === 0) return fail(400, { error: 'No rooms selected.' });

	const today = new Date().toISOString().slice(0, 10);
	if (!propertyId)  return fail(400, { error: 'Property is required.' });
	if (!checkIn  || checkIn < today)       return fail(400, { error: 'Check-in date must be today or later.' });
	if (!checkOut || checkOut <= checkIn)   return fail(400, { error: 'Check-out must be after check-in.' });
	if (!guestName)   return fail(400, { error: 'Your name is required.' });
	if (!guestEmail || !guestEmail.includes('@')) return fail(400, { error: 'A valid email is required.' });

	const stayNights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);

	const propRow = await db.query.properties.findFirst({
		where: eq(properties.id, propertyId),
		columns: { defaultMaxNights: true, gapFillNights: true }
	});

	// Validate each room type and track how many slots of each pool we are claiming
	const poolClaimed = new Map<string, number>(); // poolRootId → rooms claimed in this group

	for (const item of items) {
		const rt = await db.query.roomTypes.findFirst({
			where: and(eq(roomTypes.id, item.roomTypeId), eq(roomTypes.propertyId, propertyId)),
			columns: { id: true, name: true, parentRoomTypeId: true, maxNights: true }
		});
		if (!rt) return fail(400, { error: 'Invalid room type selection.' });

		const effectiveMaxNights = rt.maxNights ?? propRow?.defaultMaxNights ?? null;
		if (effectiveMaxNights !== null && stayNights > effectiveMaxNights)
			return fail(400, { error: `Maximum stay is ${effectiveMaxNights} nights for "${rt.name}".` });

		const poolRootId = rt.parentRoomTypeId ?? item.roomTypeId;

		// Rate override checks
		const stayOverrides = await db.query.rateOverrides.findMany({
			where: and(eq(rateOverrides.roomTypeId, item.roomTypeId), gte(rateOverrides.date, checkIn), lt(rateOverrides.date, checkOut)),
			columns: { date: true, stopSell: true, closedToArrival: true, minNights: true }
		});
		if (stayOverrides.some((o) => o.stopSell))
			return fail(400, { error: `"${rt.name}" dates are no longer available.` });
		const ctaOverride = stayOverrides.find((o) => o.date === checkIn);
		if (ctaOverride?.closedToArrival)
			return fail(400, { error: `Check-in is not available on that date for "${rt.name}".` });
		const maxMin = stayOverrides.reduce((m, o) => Math.max(m, o.minNights ?? 1), 1);
		if (stayNights < maxMin)
			return fail(400, { error: `Minimum ${maxMin}-night stay required for "${rt.name}".` });

		// Availability check (include already-claimed slots from earlier items in this group)
		const propRooms = await db.query.rooms.findMany({
			where: and(eq(rooms.propertyId, propertyId), eq(rooms.roomTypeId, poolRootId), eq(rooms.isActive, true)),
			columns: { id: true }
		});
		const roomIds    = propRooms.map((r) => r.id);
		const totalRooms = roomIds.length;
		if (totalRooms === 0) return fail(400, { error: `No rooms of type "${rt.name}" exist.` });

		const conflictedCount = roomIds.length > 0
			? (await db.select({ roomId: bookings.roomId }).from(bookings).where(and(
				lt(bookings.checkInDate, checkOut), gt(bookings.checkOutDate, checkIn),
				ne(bookings.status, 'cancelled'), ne(bookings.status, 'blocked'),
				inArray(bookings.roomId, roomIds)
			))).length
			: 0;

		const poolTypeIds = await db.query.roomTypes.findMany({
			where: eq(roomTypes.propertyId, propertyId),
			columns: { id: true, parentRoomTypeId: true }
		}).then((rts) => [poolRootId, ...rts.filter((r) => r.parentRoomTypeId === poolRootId).map((r) => r.id)]);
		const unassignedCount = (await db.select({ id: bookings.id }).from(bookings).where(and(
			lt(bookings.checkInDate, checkOut), gt(bookings.checkOutDate, checkIn),
			ne(bookings.status, 'cancelled'), ne(bookings.status, 'blocked'),
			isNull(bookings.roomId), eq(bookings.propertyId, propertyId),
			inArray(bookings.requestedRoomTypeId, poolTypeIds)
		))).length;

		const alreadyClaimed = poolClaimed.get(poolRootId) ?? 0;
		if (conflictedCount + unassignedCount + alreadyClaimed + item.qty > totalRooms)
			return fail(400, { error: `Not enough "${rt.name}" rooms available for those dates.` });

		poolClaimed.set(poolRootId, alreadyClaimed + item.qty);
	}

	// ── All validated — create guest, group, and bookings ────────────────────
	let guest = await db.query.guests.findFirst({ where: eq(guests.email, guestEmail), columns: { id: true } });
	if (!guest) {
		const [g] = await db.insert(guests).values({ name: guestName, email: guestEmail, phone: guestPhone || null }).returning({ id: guests.id });
		guest = g;
	}

	const onlineCh = await db.query.bookingChannels.findFirst({ where: eq(bookingChannels.name, 'Online'), columns: { id: true } });

	const groupId = crypto.randomUUID();
	await db.insert(groups).values({
		id: groupId,
		propertyId,
		name: `Online Group – ${guestName}`,
		organizerName: guestName,
		organizerEmail: guestEmail,
		organizerPhone: guestPhone || null,
		billingType: 'individual',
		notes: notes || null
	});

	let firstToken: string | null = null;
	const roomTypeNames: string[] = [];

	for (const item of items) {
		const rt = await db.query.roomTypes.findFirst({ where: eq(roomTypes.id, item.roomTypeId), columns: { name: true } });
		roomTypeNames.push(rt?.name ?? item.roomTypeId);

		for (let slot = 0; slot < item.qty; slot++) {
			const token = randomToken(8);
			if (!firstToken) firstToken = token;

			const [b] = await db.insert(bookings).values({
				propertyId, roomId: null, requestedRoomTypeId: item.roomTypeId,
				guestId: guest.id, channelId: onlineCh?.id ?? null,
				status: 'confirmed', checkInDate: checkIn, checkOutDate: checkOut,
				numAdults, numChildren, notes: notes || null,
				publicToken: token, groupId
			}).returning({ id: bookings.id });

			if (item.quotedTotalCents > 0 && item.quotedNights > 0) {
				await db.insert(bookingLineItems).values({
					bookingId: b.id, type: 'rate',
					label: `Room rate · ${item.quotedNights} night${item.quotedNights === 1 ? '' : 's'} (online booking)`,
					quantity: item.quotedNights,
					unitAmount: Math.round(item.quotedTotalCents / item.quotedNights),
					totalAmount: item.quotedTotalCents, sortOrder: 0
				});
			}
			void syncARIForStay(item.roomTypeId, checkIn, checkOut).catch((e) => console.error('[ari-sync] public-book-group:', e));
		}
	}

	const token = firstToken!;
	const propData = await db.query.properties.findFirst({ where: eq(properties.id, propertyId), columns: { name: true, emailNote: true, emailSignature: true } });
	const origin = env.ORIGIN ?? 'http://localhost:5173';
	const confirmUrl = `${origin}/book/confirmation/${token}`;
	const totalRooms = items.reduce((s, i) => s + i.qty, 0);

	void sendGuestConfirmation({ guestName, guestEmail, propertyName: propData?.name ?? propertyId, checkInDate: checkIn, checkOutDate: checkOut, nights: stayNights, requestedRoomType: `${totalRooms} rooms (${roomTypeNames.join(', ')})`, quotedTotalCents: null, publicToken: token, confirmationUrl: confirmUrl, emailNote: propData?.emailNote ?? null, emailSignature: propData?.emailSignature ?? null });
	void sendOperatorAlert({ guestName, guestEmail, propertyName: propData?.name ?? propertyId, checkInDate: checkIn, checkOutDate: checkOut, nights: stayNights, requestedRoomType: `Group: ${totalRooms} rooms (${roomTypeNames.join(', ')})`, quotedTotalCents: null, confirmationUrl: confirmUrl });

	return { success: true, token };
}
