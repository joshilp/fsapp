import { fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import {
	bookingLineItems,
	bookings,
	guests,
	paymentEvents,
	taxPresets
} from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		with: {
			guest: true,
			room: {
				with: {
					roomType: true,
					property: true
				}
			},
			lineItems: {
				orderBy: (li, { asc }) => [asc(li.sortOrder)]
			},
			paymentEvents: {
				orderBy: (pe, { asc }) => [asc(pe.chargedAt)]
			},
			channel: { columns: { name: true } }
		}
	});

	if (!booking) redirect(303, '/booking');
	if (booking.status === 'checked_out' || booking.status === 'cancelled') {
		redirect(303, '/booking');
	}

	const presets = await db.query.taxPresets.findMany({
		where: and(eq(taxPresets.propertyId, booking.propertyId), eq(taxPresets.isActive, true)),
		orderBy: (t, { asc }) => [asc(t.sortOrder)]
	});

	// If this is a continuation booking (room move), load prior room summary for context
	let priorStay: {
		roomNumber: string | null;
		checkInDate: string;
		checkOutDate: string;
		chargesCents: number;
	} | null = null;

	if (booking.movedFromBookingId) {
		const prior = await db.query.bookings.findFirst({
			where: eq(bookings.id, booking.movedFromBookingId),
			columns: { checkInDate: true, checkOutDate: true },
			with: {
				room: { columns: { roomNumber: true } },
				lineItems: { columns: { type: true, totalAmount: true } }
			}
		});
		if (prior) {
			priorStay = {
				roomNumber: prior.room?.roomNumber ?? null,
				checkInDate: prior.checkInDate,
				checkOutDate: prior.checkOutDate,
				chargesCents: (prior.lineItems ?? [])
					.filter((li) => li.type !== 'deposit')
					.reduce((sum, li) => sum + li.totalAmount, 0)
			};
		}
	}

	return { booking, taxPresets: presets, priorStay };
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const bookingId = params.id;
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const booking = await db.query.bookings.findFirst({
			where: eq(bookings.id, bookingId),
			columns: { guestId: true, propertyId: true, checkInDate: true, status: true }
		});
		if (!booking) return fail(404, { error: 'Booking not found' });

		// Update guest contact / address info
		if (booking.guestId) {
			const guestUpdate: Record<string, string | null> = {};
			const phone = g('guestPhone');
			const email = g('guestEmail');
			const street = g('guestStreet');
			const city = g('guestCity');
			const province = g('guestProvince');
			const country = g('guestCountry');
			if (phone !== null) guestUpdate.phone = phone;
			if (email !== null) guestUpdate.email = email;
			if (street !== null) guestUpdate.street = street;
			if (city !== null) guestUpdate.city = city;
			if (province !== null) guestUpdate.provinceState = province;
			if (country !== null) guestUpdate.country = country;
			if (Object.keys(guestUpdate).length > 0) {
				await db.update(guests).set(guestUpdate).where(eq(guests.id, booking.guestId));
			}
		}

		// Update booking core fields
		await db
			.update(bookings)
			.set({
				status: 'checked_in',
				checkedInAt: new Date(),
				numAdults: Math.max(1, parseInt(g('numAdults') ?? '1') || 1),
				numChildren: Math.max(0, parseInt(g('numChildren') ?? '0') || 0),
				vehicleMake: g('vehicleMake'),
				vehicleColour: g('vehicleColour'),
				vehiclePlate: g('vehiclePlate'),
				otaConfirmationNumber: g('otaConfirmationNumber'),
				notes: g('notes')
			})
			.where(eq(bookings.id, bookingId));

		// Delete old rate/tax/extra line items — replace with what operator entered
		await db
			.delete(bookingLineItems)
			.where(and(eq(bookingLineItems.bookingId, bookingId), ne(bookingLineItems.type, 'deposit')));

		// Parse and insert new line items
		const newItems: (typeof bookingLineItems.$inferInsert)[] = [];

		const rateCount = parseInt((fd.get('rateCount') as string) ?? '0') || 0;
		for (let i = 0; i < rateCount; i++) {
			const label = g(`rate-label-${i}`);
			const qty = parseFloat((fd.get(`rate-qty-${i}`) as string) ?? '') || null;
			const unit = parseFloat((fd.get(`rate-unit-${i}`) as string) ?? '') || null;
			const total = parseFloat((fd.get(`rate-total-${i}`) as string) ?? '');
			if (label && !isNaN(total) && total !== 0) {
				newItems.push({
					id: crypto.randomUUID(),
					bookingId,
					type: 'rate',
					label,
					quantity: qty,
					unitAmount: unit !== null ? Math.round(unit * 100) : null,
					totalAmount: Math.round(total * 100),
					sortOrder: i
				});
			}
		}

		const taxCount = parseInt((fd.get('taxCount') as string) ?? '0') || 0;
		for (let i = 0; i < taxCount; i++) {
			const label = g(`tax-label-${i}`);
			const total = parseFloat((fd.get(`tax-total-${i}`) as string) ?? '');
			if (label && !isNaN(total) && total !== 0) {
				newItems.push({
					id: crypto.randomUUID(),
					bookingId,
					type: 'tax',
					label,
					quantity: null,
					unitAmount: null,
					totalAmount: Math.round(total * 100),
					sortOrder: 100 + i
				});
			}
		}

		if (newItems.length > 0) {
			await db.insert(bookingLineItems).values(newItems);
		}

		// Record an explicit payment only if the operator entered an amount
		const paymentAmountStr = g('paymentAmount');
		const paymentMethod = g('paymentMethod');
		if (paymentAmountStr && paymentMethod) {
			const amount = Math.round(parseFloat(paymentAmountStr) * 100);
			if (amount > 0) {
				await db.insert(paymentEvents).values({
					id: crypto.randomUUID(),
					bookingId,
					type: booking.status === 'checked_in' ? 'final_charge' : 'deposit',
					amount,
					paymentMethod,
					chargedAt: new Date()
				});
			}
		}

		const [y, m] = booking.checkInDate.split('-');
		redirect(303, `/booking?month=${y}-${m}`);
	}
};
