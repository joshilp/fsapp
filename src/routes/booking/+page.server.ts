import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { getGridData, getTodayData } from '$lib/server/booking-queries';
import { db } from '$lib/server/db';
import {
	bookingChannels,
	bookingLineItems,
	bookings,
	ccStaging,
	guests,
	paymentEvents
} from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth.schema';
import { encryptCc } from '$lib/server/cc';

// ─── Load ─────────────────────────────────────────────────────────────────────

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const now = new Date();
	const monthParam = url.searchParams.get('month');

	let year: number;
	let month: number;

	if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
		[year, month] = monthParam.split('-').map(Number);
	} else {
		year = now.getFullYear();
		month = now.getMonth() + 1;
	}

	month = Math.max(1, Math.min(12, month));

	const todayIso = now.toISOString().slice(0, 10);
	const rawView = url.searchParams.get('view');
	const viewMode: 'grid' | 'today' = rawView === 'today' ? 'today' : 'grid';

	const [falcon, spanish, channels, users, todayData] = await Promise.all([
		viewMode === 'grid' ? getGridData('prop-falcon', year, month) : Promise.resolve(null),
		viewMode === 'grid' ? getGridData('prop-spanish', year, month) : Promise.resolve(null),
		db.query.bookingChannels.findMany({
			where: eq(bookingChannels.isActive, true),
			orderBy: (t, { asc }) => [asc(t.sortOrder)]
		}),
		db.select({ id: user.id, name: user.name }).from(user).orderBy(user.name),
		viewMode === 'today' ? getTodayData(todayIso) : Promise.resolve(null)
	]);

	return {
		falcon,
		spanish,
		year,
		month,
		today: todayIso,
		viewMode,
		channels: channels.map((c) => ({ id: c.id, name: c.name })),
		users: users.map((u) => ({ id: u.id, name: u.name })),
		currentUserId: locals.user.id,
		todayData
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
			notes
		});

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

	// Check out a booking
	checkOutBooking: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const fd = await request.formData();
		const bookingId = (fd.get('bookingId') as string)?.trim();
		if (!bookingId) return fail(400, { error: 'Missing bookingId' });

		await db
			.update(bookings)
			.set({ status: 'checked_out', checkedOutAt: new Date() })
			.where(eq(bookings.id, bookingId));

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
	}
};
