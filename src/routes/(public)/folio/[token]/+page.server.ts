/**
 * Guest-facing folio page. Accessible via a secure link using the booking's
 * selfCheckinToken as the URL token — no login required for the guest.
 * Staff share this link from the booking card.
 */
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params }) => {
	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.selfCheckinToken, params.token),
		with: {
			guest: { columns: { name: true, email: true } },
			room: {
				columns: { roomNumber: true },
				with: { property: { columns: { name: true, address: true, city: true, province: true, phone: true, logoUrl: true, gstNumber: true } } }
			},
			requestedRoomType: { columns: { name: true } },
			lineItems: { orderBy: (li, { asc }) => [asc(li.createdAt)] },
			paymentEvents: { orderBy: (pe, { asc }) => [asc(pe.createdAt)] }
		}
	});

	if (!booking) throw error(404, 'Folio not found');

	const property = booking.room?.property ?? null;

	const charges = booking.lineItems.reduce((s, li) => s + li.totalAmount, 0);
	const received = booking.paymentEvents
		.filter(p => p.type !== 'refund' && (p as { status?: string | null }).status !== 'pending')
		.reduce((s, p) => s + p.amount, 0);
	const refunded = booking.paymentEvents
		.filter(p => p.type === 'refund')
		.reduce((s, p) => s + p.amount, 0);
	const balance = charges - received + refunded;

	const nights = Math.round(
		(new Date(booking.checkOutDate + 'T12:00:00').getTime() -
			new Date(booking.checkInDate + 'T12:00:00').getTime()) / 86400000
	);

	return { booking, property, charges, received, refunded, balance, nights };
};
