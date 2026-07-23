import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';
import { sendSelfCheckinAlert } from '$lib/server/email';

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
			vehicleMake: true,
			vehicleColour: true,
			vehiclePlate: true,
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
							accentColour: true,
						}
					}
				}
			}
		}
	});

	if (!booking) throw error(404, 'Check-in link not found or has expired.');

	return { booking };
};

export const actions: Actions = {
	complete: async ({ params, request }) => {
		const formData = await request.formData();
		const vehicleMake   = formData.get('vehicleMake')?.toString().trim() || null;
		const vehicleColour = formData.get('vehicleColour')?.toString().trim() || null;
		const vehiclePlate  = formData.get('vehiclePlate')?.toString().trim() || null;

		const booking = await db.query.bookings.findFirst({
			where: eq(bookings.selfCheckinToken, params.token),
			columns: { id: true, selfCheckinAt: true, status: true, checkInDate: true, checkOutDate: true },
			with: {
				guest: { columns: { name: true } },
				room: {
					columns: { roomNumber: true },
					with: { property: { columns: { name: true } } }
				}
			}
		});
		if (!booking) throw error(404, 'Not found');
		if (booking.selfCheckinAt) return { alreadyDone: true };

		const newStatus = booking.status === 'confirmed' ? 'checked_in' : booking.status;

		await db.update(bookings).set({
			selfCheckinAt: new Date(),
			waiverSigned: true,
			status: newStatus,
			vehicleMake,
			vehicleColour,
			vehiclePlate,
		}).where(eq(bookings.selfCheckinToken, params.token));

		// Notify operator
		const origin = env.ORIGIN ?? '';
		void sendSelfCheckinAlert({
			guestName:    booking.guest?.name ?? 'Guest',
			propertyName: booking.room?.property?.name ?? 'Property',
			roomNumber:   booking.room?.roomNumber ?? null,
			checkInDate:  booking.checkInDate,
			checkOutDate: booking.checkOutDate,
			dashboardUrl: `${origin}/booking/${booking.id}`,
		}).catch((e) => console.error('[email] self-checkin alert:', e));

		return { success: true };
	}
};
