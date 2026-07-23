import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params }) => {
	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.publicToken, params.token),
		with: {
			guest: { columns: { name: true, email: true, phone: true } },
			room: {
				columns: { roomNumber: true },
				with: {
					roomType: { columns: { name: true } },
					property: {
						columns: {
							name: true, logoUrl: true, accentColour: true,
							address: true, city: true, province: true,
							phone: true, gstNumber: true, policyText: true
						}
					}
				}
			},
			lineItems: { orderBy: (li, { asc }) => [asc(li.sortOrder)] },
			paymentEvents: {
				orderBy: (pe, { asc }) => [asc(pe.chargedAt)],
				columns: { type: true, paymentMethod: true, amount: true, receiptNumber: true, status: true, chargedAt: true }
			},
			channel: { columns: { name: true } },
			requestedRoomType: { columns: { name: true } }
		},
		columns: {
			id: true, status: true, publicToken: true,
			checkInDate: true, checkOutDate: true,
			numAdults: true, numChildren: true, notes: true
		}
	});

	if (!booking) error(404, 'Receipt not found');

	// Don't show receipt for cancelled or very early-stage bookings
	if (booking.status === 'cancelled') error(404, 'Receipt not available');

	return { booking };
};
