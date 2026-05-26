import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params }) => {
	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.selfCheckinToken, params.token),
		columns: {
			id: true,
			status: true,
			checkInDate: true,
			checkOutDate: true,
			numAdults: true,
			numChildren: true,
			selfCheckinAt: true,
			waiverSigned: true,
		},
		with: {
			guest: { columns: { name: true, email: true, phone: true } },
			room: {
				columns: {
					roomNumber: true,
					doorCode: true,
					checkinInstructions: true,
				},
				with: {
					roomType: { columns: { name: true } },
					property: {
						columns: {
							name: true,
							logoUrl: true,
							address: true,
							city: true,
							province: true,
							phone: true,
							checkinTime: true,
							checkoutTime: true,
							policyText: true,
						}
					}
				}
			}
		}
	});

	if (!booking) throw error(404, 'Check-in link not found or has expired.');

	// Already completed — still show the confirmation screen
	return { booking };
};

export const actions: Actions = {
	complete: async ({ params }) => {
		const booking = await db.query.bookings.findFirst({
			where: eq(bookings.selfCheckinToken, params.token),
			columns: { id: true, selfCheckinAt: true }
		});
		if (!booking) throw error(404, 'Not found');
		if (booking.selfCheckinAt) return { alreadyDone: true };

		await db.update(bookings).set({
			selfCheckinAt: new Date(),
			waiverSigned: true,
		}).where(eq(bookings.selfCheckinToken, params.token));

		return { success: true };
	}
};
