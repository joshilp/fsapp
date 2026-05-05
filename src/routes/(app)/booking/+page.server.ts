import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getGridData, getTodayData, getUnassignedBookings } from '$lib/server/booking-queries';
import { db } from '$lib/server/db';
import {
	bookingChannels,
	bookingLineItems,
	bookings,
	ccStaging,
	guests,
	paymentEvents,
	rooms
} from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth.schema';
import { encryptCc } from '$lib/server/cc';

// ─── Load ─────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const now = new Date();

	// Support ?start=YYYY-MM-DD (new rolling window) and legacy ?month=YYYY-MM
	const startParam = url.searchParams.get('start');
	const monthParam = url.searchParams.get('month');

	let startDate: string;
	if (startParam && /^\d{4}-\d{2}-\d{2}$/.test(startParam)) {
		startDate = startParam;
	} else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
		startDate = monthParam + '-01';
	} else {
		// Default: first day of current month
		startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
	}

	const numDays = 35; // 5-week rolling window

	const todayIso = now.toISOString().slice(0, 10);
	const rawView = url.searchParams.get('view');
	const viewMode: 'grid' | 'today' = rawView === 'today' ? 'today' : 'grid';

	const [falcon, spanish, channels, users, todayData, unassignedFalcon, unassignedSpanish] = await Promise.all([
		viewMode === 'grid' ? getGridData('prop-falcon', startDate, numDays) : Promise.resolve(null),
		viewMode === 'grid' ? getGridData('prop-spanish', startDate, numDays) : Promise.resolve(null),
		db.query.bookingChannels.findMany({
			where: eq(bookingChannels.isActive, true),
			orderBy: (t, { asc }) => [asc(t.sortOrder)]
		}),
		db.select({ id: user.id, name: user.name }).from(user).orderBy(user.name),
		viewMode === 'today' ? getTodayData(todayIso) : Promise.resolve(null),
		getUnassignedBookings('prop-falcon'),
		getUnassignedBookings('prop-spanish')
	]);

	return {
		falcon,
		spanish,
		startDate,
		numDays,
		today: todayIso,
		viewMode,
		channels: channels.map((c) => ({ id: c.id, name: c.name })),
		users: users.map((u) => ({ id: u.id, name: u.name })),
		currentUserId: locals.user.id,
		todayData,
		unassigned: { falcon: unassignedFalcon, spanish: unassignedSpanish }
	};
};

// ─── Actions ──────────────────────────────────────────────────────────────────

export const actions: Actions = {
	// Create a new confirmed booking (slip stage)
	createBooking: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const propertyId = g('propertyId');
		const roomId = g('roomId');
		const checkIn = g('checkIn');
		const checkOut = g('checkOut');
		const guestName = g('guestName');
		const guestPhone = g('guestPhone')?.replace(/\D/g, '') || null; // store digits only
		const channelId = g('channelId');
		const clerkUserId = g('clerkUserId');
		const clerkName = g('clerkName');
		const notes = g('notes');
		const otaConfirmationNumber = g('otaConfirmationNumber');
		const depositAmountStr = g('depositAmount');
		const depositMethod = g('depositMethod');
		const ccNumber = g('ccNumber');
		const ccExpiry = g('ccExpiry');
		const ccCardName = g('ccCardName');

		if (!propertyId || !roomId || !checkIn || !checkOut || !channelId) {
			return fail(400, { error: 'Missing required fields' });
		}
		if (!guestName) {
			return fail(400, { field: 'guestName', error: 'Guest name is required' });
		}
		if (checkIn >= checkOut) {
			return fail(400, { error: 'Check-out must be after check-in' });
		}

		// Server-side conflict check
		const conflict = await db.query.bookings.findFirst({
			where: and(
				eq(bookings.roomId, roomId),
				lt(bookings.checkInDate, checkOut),
				gt(bookings.checkOutDate, checkIn),
				ne(bookings.status, 'cancelled')
			),
			with: { guest: { columns: { name: true } } }
		});
		if (conflict) {
			return fail(400, {
				error: `Room already booked ${conflict.checkInDate} → ${conflict.checkOutDate}${conflict.guest ? ` (${conflict.guest.name})` : ''}`
			});
		}

		// Find or create guest (match by phone if provided)
		let guestId: string;
		if (guestPhone) {
			const existing = await db.query.guests.findFirst({
				where: eq(guests.phone, guestPhone)
			});
			if (existing) {
				guestId = existing.id;
				if (existing.name !== guestName) {
					await db.update(guests).set({ name: guestName }).where(eq(guests.id, existing.id));
				}
			} else {
				guestId = crypto.randomUUID();
				await db.insert(guests).values({ id: guestId, name: guestName, phone: guestPhone });
			}
		} else {
			guestId = crypto.randomUUID();
			await db.insert(guests).values({ id: guestId, name: guestName });
		}

		// Create booking
		const roomConfig = g('roomConfig');
		const bookingId = crypto.randomUUID();
		await db.insert(bookings).values({
			id: bookingId,
			propertyId,
			roomId,
			guestId,
			channelId,
			clerkId: clerkUserId || locals.user.id,
			clerkName: clerkUserId ? null : (clerkName || null),
			status: 'confirmed',
			checkInDate: checkIn,
			checkOutDate: checkOut,
			roomConfig: roomConfig || null,
			otaConfirmationNumber: otaConfirmationNumber || null,
			notes
		});

		// Quoted rate line items (submitted from SlipFormDialog rate section)
		// Format: li_0_type, li_0_label, li_0_qty, li_0_unit, li_0_total
		let liIdx = 0;
		while (fd.has(`li_${liIdx}_type`)) {
			const type = g(`li_${liIdx}_type`) ?? 'rate';
			const label = g(`li_${liIdx}_label`) ?? '';
			const qty = parseFloat((fd.get(`li_${liIdx}_qty`) as string) ?? '0') || null;
			const unit = parseInt((fd.get(`li_${liIdx}_unit`) as string) ?? '0', 10) || null;
			const total = parseInt((fd.get(`li_${liIdx}_total`) as string) ?? '0', 10);
			if (label && !isNaN(total)) {
				await db.insert(bookingLineItems).values({
					id: crypto.randomUUID(),
					bookingId,
					type,
					label,
					quantity: qty,
					unitAmount: unit,
					totalAmount: total,
					sortOrder: liIdx
				});
			}
			liIdx++;
		}

		// Deposit line item + payment event
		if (depositAmountStr) {
			const amount = Math.round(parseFloat(depositAmountStr) * 100);
			if (!isNaN(amount) && amount > 0) {
				await db.insert(bookingLineItems).values({
					id: crypto.randomUUID(),
					bookingId,
					type: 'deposit',
					label: 'Less Deposit Paid',
					totalAmount: -amount,
					sortOrder: 99
				});
				await db.insert(paymentEvents).values({
					id: crypto.randomUUID(),
					bookingId,
					type: 'deposit',
					amount,
					paymentMethod: depositMethod || 'card',
					chargedAt: new Date()
				});
			}
		}

		// CC staging — encrypt immediately, never persist plaintext
		if (ccNumber && ccNumber.replace(/\s/g, '').length >= 12) {
			try {
				const { encryptedData, lastFour, cardType } = encryptCc({
					number: ccNumber,
					expiry: ccExpiry || '',
					name: ccCardName || ''
				});
				await db.insert(ccStaging).values({
					id: crypto.randomUUID(),
					bookingId,
					encryptedData,
					lastFour,
					cardType,
					expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
				});
			} catch {
				console.warn('CC_ENCRYPTION_KEY not configured — CC number not stored');
			}
		}

		return { success: true, bookingId };
	},

	// Check out a booking — auto-marks room dirty
	checkOutBooking: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const fd = await request.formData();
		const bookingId = (fd.get('bookingId') as string)?.trim();
		if (!bookingId) return fail(400, { error: 'Missing bookingId' });
		const checkoutNotes = ((fd.get('checkoutNotes') as string) ?? '').trim() || null;

		const booking = await db.query.bookings.findFirst({
			where: eq(bookings.id, bookingId),
			columns: { roomId: true }
		});

		await db
			.update(bookings)
			.set({ status: 'checked_out', checkedOutAt: new Date(), checkoutNotes })
			.where(eq(bookings.id, bookingId));

		if (booking?.roomId) {
			await db
				.update(rooms)
				.set({ housekeepingStatus: 'dirty' })
				.where(eq(rooms.id, booking.roomId));
		}

		return { success: true };
	},

	// Soft-cancel a booking
	cancelBooking: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const fd = await request.formData();
		const bookingId = (fd.get('bookingId') as string)?.trim();

		if (!bookingId) return fail(400, { error: 'Missing bookingId' });

		await db
			.update(bookings)
			.set({ status: 'cancelled', cancelledAt: new Date() })
			.where(eq(bookings.id, bookingId));

		return { success: true };
	},

	// Restore a cancelled booking — re-checks conflicts first
	restoreBooking: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const fd = await request.formData();
		const bookingId = (fd.get('bookingId') as string)?.trim();
		if (!bookingId) return fail(400, { error: 'Missing bookingId' });

		const booking = await db.query.bookings.findFirst({
			where: eq(bookings.id, bookingId),
			columns: { roomId: true, checkInDate: true, checkOutDate: true }
		});
		if (!booking) return fail(404, { error: 'Booking not found' });

		const conflict = await db.query.bookings.findFirst({
			where: and(
				eq(bookings.roomId, booking.roomId),
				lt(bookings.checkInDate, booking.checkOutDate),
				gt(bookings.checkOutDate, booking.checkInDate),
				ne(bookings.status, 'cancelled'),
				ne(bookings.id, bookingId)
			)
		});
		if (conflict) {
			return fail(400, {
				error: `Cannot restore — room already booked ${conflict.checkInDate} → ${conflict.checkOutDate}`
			});
		}

		await db
			.update(bookings)
			.set({ status: 'confirmed', cancelledAt: null })
			.where(eq(bookings.id, bookingId));

		return { success: true };
	},

	// Create a maintenance block on a room for a date range
	createBlock: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const propertyId = g('propertyId');
		const roomId = g('roomId');
		const checkIn = g('checkIn');
		const checkOut = g('checkOut');
		const notes = g('notes');

		if (!propertyId || !roomId || !checkIn || !checkOut) {
			return fail(400, { error: 'Missing required fields' });
		}
		if (checkIn >= checkOut) return fail(400, { error: 'End must be after start' });

		const conflict = await db.query.bookings.findFirst({
			where: and(
				eq(bookings.roomId, roomId),
				lt(bookings.checkInDate, checkOut),
				gt(bookings.checkOutDate, checkIn),
				ne(bookings.status, 'cancelled')
			),
			with: { guest: { columns: { name: true } } }
		});
		if (conflict) {
			return fail(400, {
				error: `Conflict with existing booking ${conflict.checkInDate} → ${conflict.checkOutDate}${conflict.guest ? ` (${conflict.guest.name})` : ''}`
			});
		}

		// Use a placeholder guest record for blocks
		let blockGuestId: string;
		const blockGuest = await db.query.guests.findFirst({
			where: eq(guests.name, '__maintenance__')
		});
		if (blockGuest) {
			blockGuestId = blockGuest.id;
		} else {
			blockGuestId = crypto.randomUUID();
			await db.insert(guests).values({ id: blockGuestId, name: '__maintenance__' });
		}

		await db.insert(bookings).values({
			id: crypto.randomUUID(),
			propertyId,
			roomId,
			guestId: blockGuestId,
			channelId: null,
			clerkId: locals.user.id,
			status: 'blocked',
			checkInDate: checkIn,
			checkOutDate: checkOut,
			notes: notes || 'Maintenance block'
		});

		return { success: true };
	},

	// ─── Unified booking card save ──────────────────────────────────────────────
	// intent=save   → create/update fields, keep status
	// intent=checkIn → create/update + set checked_in
	// intent=checkOut → update + set checked_out (+ room dirty)
	saveCard: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const bookingId  = g('bookingId');    // empty → create new
		const intent     = (g('intent') ?? 'save') as 'save' | 'checkIn' | 'checkOut';
		const bookingType = g('bookingType') ?? 'phone'; // walkin | phone | website | bookingcom | expedia | airbnb | other
		const propertyId = g('propertyId');
		const roomId     = g('roomId');
		const checkIn    = g('checkIn');
		const checkOut   = g('checkOut');
		const channelId  = g('channelId');
		const roomConfig = g('roomConfig');
		const notes      = g('notes');
		const checkoutNotes = g('checkoutNotes');
		const otaConfirmationNumber = g('otaConfirmationNumber');
		const waiverSigned = fd.get('waiverSigned') === 'on';
		const numAdults  = Math.max(1, parseInt(g('numAdults') ?? '1') || 1);
		const numChildren = Math.max(0, parseInt(g('numChildren') ?? '0') || 0);
		const vehicleMake    = g('vehicleMake');
		const vehicleColour  = g('vehicleColour');
		const vehiclePlate   = g('vehiclePlate');
		const clerkUserId    = g('clerkUserId');
		const clerkName      = g('clerkName');
		const guestName   = g('guestName');
		const guestPhone  = g('guestPhone')?.replace(/\D/g, '') || null;
		const guestEmail  = g('guestEmail');
		const guestStreet = g('guestStreet');
		const guestCity   = g('guestCity');
		const guestProvince = g('guestProvince');
		const guestCountry  = g('guestCountry');
		const existingGuestId = g('guestId');

		if (!checkIn || !checkOut) return fail(400, { error: 'Check-in and check-out dates are required' });
		if (checkIn >= checkOut) return fail(400, { error: 'Check-out must be after check-in' });

		// ── Guest: find or create ─────────────────────────────────────────────
		let guestId: string | null = null;
		if (guestName) {
			if (existingGuestId) {
				// Update existing guest record
				guestId = existingGuestId;
				await db.update(guests).set({
					name: guestName,
					...(guestPhone !== null ? { phone: guestPhone } : {}),
					...(guestEmail !== null ? { email: guestEmail } : {}),
					...(guestStreet !== null ? { street: guestStreet } : {}),
					...(guestCity !== null ? { city: guestCity } : {}),
					...(guestProvince !== null ? { provinceState: guestProvince } : {}),
					...(guestCountry !== null ? { country: guestCountry } : {})
				}).where(eq(guests.id, existingGuestId));
			} else if (guestPhone) {
				// Match by phone
				const existing = await db.query.guests.findFirst({ where: eq(guests.phone, guestPhone) });
				if (existing) {
					guestId = existing.id;
					await db.update(guests).set({
						name: guestName,
						email: guestEmail,
						street: guestStreet,
						city: guestCity,
						provinceState: guestProvince,
						country: guestCountry
					}).where(eq(guests.id, existing.id));
				} else {
					guestId = crypto.randomUUID();
					await db.insert(guests).values({ id: guestId, name: guestName, phone: guestPhone, email: guestEmail, street: guestStreet, city: guestCity, provinceState: guestProvince, country: guestCountry });
				}
			} else {
				guestId = crypto.randomUUID();
				await db.insert(guests).values({ id: guestId, name: guestName, email: guestEmail, street: guestStreet, city: guestCity, provinceState: guestProvince, country: guestCountry });
			}
		}

		// ── Line items ────────────────────────────────────────────────────────
		const newItems: (typeof bookingLineItems.$inferInsert)[] = [];
		const rateCount = parseInt((fd.get('rateCount') as string) ?? '0') || 0;
		for (let i = 0; i < rateCount; i++) {
			const label = g(`rate-label-${i}`);
			const qty   = parseFloat((fd.get(`rate-qty-${i}`) as string) ?? '') || null;
			const unit  = parseFloat((fd.get(`rate-unit-${i}`) as string) ?? '') || null;
			const total = parseFloat((fd.get(`rate-total-${i}`) as string) ?? '');
			if (label && !isNaN(total) && total !== 0) {
				newItems.push({ id: crypto.randomUUID(), bookingId: bookingId ?? '', type: 'rate', label, quantity: qty, unitAmount: unit !== null ? Math.round(unit * 100) : null, totalAmount: Math.round(total * 100), sortOrder: i });
			}
		}
		const taxCount = parseInt((fd.get('taxCount') as string) ?? '0') || 0;
		for (let i = 0; i < taxCount; i++) {
			const label = g(`tax-label-${i}`);
			const total = parseFloat((fd.get(`tax-total-${i}`) as string) ?? '');
			if (label && !isNaN(total) && total !== 0) {
				newItems.push({ id: crypto.randomUUID(), bookingId: bookingId ?? '', type: 'tax', label, quantity: null, unitAmount: null, totalAmount: Math.round(total * 100), sortOrder: rateCount + i });
			}
		}

		const now = new Date();
		// Status: walk-in always starts checked_in; checkIn/checkOut intents transition
		let status = 'confirmed';
		let checkedInAt: Date | undefined;
		let checkedOutAt: Date | undefined;
		if (bookingType === 'walkin' || intent === 'checkIn') { status = 'checked_in'; checkedInAt = now; }
		if (intent === 'checkOut') { status = 'checked_out'; checkedOutAt = now; }

		if (!bookingId) {
			// ── CREATE ────────────────────────────────────────────────────────
			if (!propertyId || !roomId || !channelId) return fail(400, { error: 'Property, room, and channel are required' });
			const conflict = await db.query.bookings.findFirst({
				where: and(eq(bookings.roomId, roomId), lt(bookings.checkInDate, checkOut!), gt(bookings.checkOutDate, checkIn!), ne(bookings.status, 'cancelled'))
			});
			if (conflict) return fail(400, { error: `Room already booked ${conflict.checkInDate} → ${conflict.checkOutDate}` });

			const newId = crypto.randomUUID();
			await db.insert(bookings).values({
				id: newId, propertyId, roomId, guestId, channelId,
				clerkId: clerkUserId || locals.user.id,
				clerkName: clerkUserId ? null : (clerkName || null),
				status, checkInDate: checkIn!, checkOutDate: checkOut!, roomConfig,
				otaConfirmationNumber, notes, numAdults, numChildren,
				vehicleMake, vehicleColour, vehiclePlate, waiverSigned,
				checkedInAt, checkedOutAt
			});
			// Insert line items
			if (newItems.length > 0) {
				await db.insert(bookingLineItems).values(newItems.map(li => ({ ...li, bookingId: newId })));
			}
			// Initial deposit from slip
			const depositAmountStr = g('depositAmount');
			const depositMethod = g('depositMethod');
			if (depositAmountStr) {
				const amt = Math.round(parseFloat(depositAmountStr) * 100);
				if (!isNaN(amt) && amt > 0) {
					await db.insert(paymentEvents).values({ id: crypto.randomUUID(), bookingId: newId, type: 'deposit', amount: amt, paymentMethod: depositMethod || 'cash', chargedAt: now });
				}
			}
			redirect(303, `/booking?month=${checkIn!.slice(0, 7)}`);
		} else {
			// ── UPDATE ────────────────────────────────────────────────────────
			const existing = await db.query.bookings.findFirst({ where: eq(bookings.id, bookingId), columns: { status: true, checkInDate: true, checkedInAt: true, roomId: true } });
			if (!existing) return fail(404, { error: 'Booking not found' });

			// Preserve checked_in timestamp if already set
			if (intent !== 'checkOut' && existing.status === 'checked_in') { status = 'checked_in'; checkedInAt = existing.checkedInAt ?? now; }
			if (existing.status === 'checked_out' && intent === 'save') { status = 'checked_out'; }

			// Conflict check only if room changed
			if (roomId && roomId !== existing.roomId) {
				const conflict = await db.query.bookings.findFirst({
					where: and(eq(bookings.roomId, roomId), lt(bookings.checkInDate, checkOut!), gt(bookings.checkOutDate, checkIn!), ne(bookings.status, 'cancelled'), ne(bookings.id, bookingId))
				});
				if (conflict) return fail(400, { error: `Room already booked ${conflict.checkInDate} → ${conflict.checkOutDate}` });
			}

			await db.update(bookings).set({
				checkInDate: checkIn!, checkOutDate: checkOut!,
				...(roomId ? { roomId } : {}),
				...(channelId ? { channelId } : {}),
				...(guestId ? { guestId } : {}),
				roomConfig, notes, otaConfirmationNumber, numAdults, numChildren,
				vehicleMake, vehicleColour, vehiclePlate, waiverSigned, status,
				...(checkedInAt ? { checkedInAt } : {}),
				...(checkedOutAt ? { checkedOutAt } : {}),
				...(intent === 'checkOut' ? { checkoutNotes } : {})
			}).where(eq(bookings.id, bookingId));

			// Mark room dirty on checkout
			if (intent === 'checkOut' && (roomId || existing.roomId)) {
				await db.update(rooms).set({ housekeepingStatus: 'dirty' }).where(eq(rooms.id, roomId || existing.roomId!));
			}

			// Replace rate/tax line items (preserve deposits)
			await db.delete(bookingLineItems).where(and(eq(bookingLineItems.bookingId, bookingId), ne(bookingLineItems.type, 'deposit')));
			if (newItems.length > 0) {
				await db.insert(bookingLineItems).values(newItems.map(li => ({ ...li, bookingId })));
			}

			redirect(303, `/booking?month=${checkIn!.slice(0, 7)}`);
		}
	},

	// Add a payment event to an existing booking
	addPayment: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;
		const bookingId = g('bookingId');
		if (!bookingId) return fail(400, { error: 'Missing bookingId' });
		const amountStr = g('amount');
		const method = g('method') ?? 'cash';
		const type = g('type') ?? 'final_charge';
		const notes = g('notes');
		if (!amountStr) return fail(400, { error: 'Amount is required' });
		const amount = Math.round(parseFloat(amountStr) * 100);
		if (isNaN(amount) || amount <= 0) return fail(400, { error: 'Invalid amount' });
		await db.insert(paymentEvents).values({ id: crypto.randomUUID(), bookingId, type, amount, paymentMethod: method, notes, chargedAt: new Date() });
		return { success: true };
	}
};
