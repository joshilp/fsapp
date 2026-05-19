/**
 * PATCH /api/payment-events/[id]/receive
 * Marks a pending payment event as received and optionally promotes
 * the associated booking from 'reserved' to 'confirmed'.
 * Also auto-sends a guest confirmation email if the booking was just promoted.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { paymentEvents, bookings } from '$lib/server/db/schema';
import { sendGuestConfirmation } from '$lib/server/email';

export const PATCH: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const pe = await db.query.paymentEvents.findFirst({
		where: eq(paymentEvents.id, params.id),
		columns: { id: true, bookingId: true, status: true }
	});
	if (!pe) return json({ error: 'Not found' }, { status: 404 });
	if (pe.status === 'received') return json({ ok: true, alreadyReceived: true });

	const now = new Date();

	// Mark the payment as received
	await db.update(paymentEvents)
		.set({ status: 'received', chargedAt: now })
		.where(eq(paymentEvents.id, params.id));

	// Promote booking from reserved → confirmed if this was the first received payment
	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, pe.bookingId),
		columns: { status: true },
		with: {
			guest: { columns: { name: true, email: true } },
			room: {
				columns: {},
				with: {
					property: { columns: { name: true } },
					roomType: { columns: { name: true } }
				}
			},
			lineItems: { columns: { totalAmount: true } }
		}
	});
	let promoted = false;
	if (booking?.status === 'reserved') {
		await db.update(bookings)
			.set({ status: 'confirmed', confirmationSentAt: now })
			.where(eq(bookings.id, pe.bookingId));
		promoted = true;

		// Auto-send confirmation email to guest
		const fullBooking = await db.query.bookings.findFirst({
			where: eq(bookings.id, pe.bookingId),
			columns: { checkInDate: true, checkOutDate: true, publicToken: true, requestedRoomTypeId: true },
			with: {
				guest: { columns: { name: true, email: true } },
				room: { columns: {}, with: { property: { columns: { name: true } }, roomType: { columns: { name: true } } } },
				lineItems: { columns: { totalAmount: true } }
			}
		});
		if (fullBooking?.guest?.email) {
			const nights = Math.max(0, Math.round(
				(new Date(fullBooking.checkOutDate + 'T12:00:00').getTime() -
				 new Date(fullBooking.checkInDate + 'T12:00:00').getTime()) / 86400000
			));
			const origin = env.ORIGIN || url.origin;
			const token = fullBooking.publicToken;
			await sendGuestConfirmation({
				guestName: fullBooking.guest.name,
				guestEmail: fullBooking.guest.email,
				propertyName: fullBooking.room?.property?.name ?? '',
				checkInDate: fullBooking.checkInDate,
				checkOutDate: fullBooking.checkOutDate,
				nights,
				requestedRoomType: fullBooking.room?.roomType?.name ?? null,
				quotedTotalCents: fullBooking.lineItems.reduce((s, li) => s + li.totalAmount, 0) || null,
				publicToken: token ?? '',
				confirmationUrl: token ? `${origin}/booking/confirm/${token}` : `${origin}/booking`
			}).catch(err => console.error('[receive] email error:', err));
		}
	}

	return json({ ok: true, promoted });
};
