import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookingLineItems, bookings } from '$lib/server/db/schema';

export type PriorStayInfo = {
	bookingId: string;
	roomNumber: string | null;
	checkInDate: string;
	checkOutDate: string;
	/** Sum of rate + tax + extra line items (cents). Excludes deposits. */
	chargesCents: number;
	/** Formatted for display, e.g. "$516.00" */
	chargesFormatted: string;
};

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return new Response('Unauthorized', { status: 401 });

	const bookingId = params.id;

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, bookingId),
		columns: { id: true, checkInDate: true, checkOutDate: true, movedFromBookingId: true },
		with: {
			room: { columns: { roomNumber: true } }
		}
	});

	if (!booking?.movedFromBookingId) {
		return json({ prior: null });
	}

	const prior = await db.query.bookings.findFirst({
		where: eq(bookings.id, booking.movedFromBookingId),
		columns: { id: true, checkInDate: true, checkOutDate: true },
		with: {
			room: { columns: { roomNumber: true } },
			lineItems: { columns: { type: true, totalAmount: true } }
		}
	});

	if (!prior) return json({ prior: null });

	const chargesCents = (prior.lineItems ?? [])
		.filter((li) => li.type !== 'deposit')
		.reduce((sum, li) => sum + li.totalAmount, 0);

	const info: PriorStayInfo = {
		bookingId: prior.id,
		roomNumber: prior.room?.roomNumber ?? null,
		checkInDate: prior.checkInDate,
		checkOutDate: prior.checkOutDate,
		chargesCents,
		chargesFormatted: `$${(chargesCents / 100).toFixed(2)}`
	};

	return json({ prior: info });
};
