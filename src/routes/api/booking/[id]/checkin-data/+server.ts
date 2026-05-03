import { json, error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, taxPresets } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		with: {
			guest: true,
			room: { with: { roomType: true, property: true } },
			lineItems: { orderBy: (li, { asc }) => [asc(li.sortOrder)] },
			paymentEvents: { orderBy: (pe, { asc }) => [asc(pe.chargedAt)] },
			channel: { columns: { name: true } }
		}
	});

	if (!booking) throw error(404, 'Not found');

	const presets = await db.query.taxPresets.findMany({
		where: and(eq(taxPresets.propertyId, booking.propertyId), eq(taxPresets.isActive, true)),
		orderBy: (t, { asc }) => [asc(t.sortOrder)]
	});

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

	return json({ booking, taxPresets: presets, priorStay });
};
