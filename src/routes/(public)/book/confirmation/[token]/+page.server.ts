import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params }) => {
	const { token } = params;

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.publicToken, token),
		with: {
			property: { columns: { name: true, address: true, city: true, province: true, phone: true, checkinTime: true, checkoutTime: true } },
			guest: { columns: { name: true, email: true, phone: true } },
			requestedRoomType: { columns: { name: true, category: true } }
		},
		columns: { id: true, publicToken: true, status: true, checkInDate: true, checkOutDate: true, numAdults: true, numChildren: true, notes: true }
	});

	if (!booking || booking.publicToken !== token) {
		error(404, 'Reservation not found. Please check your confirmation link.');
	}

	const nights = Math.max(0, Math.round(
		(new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 86400000
	));

	return { booking, nights };
};
