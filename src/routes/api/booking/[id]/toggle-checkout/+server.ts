import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';
import { sendCheckoutReceipt } from '$lib/server/email';
import { env } from '$env/dynamic/private';

/** POST /api/booking/[id]/toggle-checkout
 *  If checked_out → revert to checked_in
 *  If checked_in  → set checked_out + mark room dirty + email receipt
 *  Returns { status, checkedOutAt, unpaid: boolean }
 */
export const POST: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const id = params.id;

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, id),
		columns: { id: true, status: true, checkedOutAt: true, roomId: true, checkInDate: true, checkOutDate: true, publicToken: true },
		with: {
			guest: { columns: { name: true, email: true } },
			room: {
				columns: { roomNumber: true },
				with: {
					roomType: { columns: { name: true } },
					property: { columns: { name: true, phone: true, address: true, city: true, province: true, gstNumber: true } }
				}
			},
			lineItems: { columns: { type: true, label: true, totalAmount: true } },
			paymentEvents: { columns: { type: true, paymentMethod: true, amount: true, receiptNumber: true, status: true } }
		}
	});
	if (!booking) return json({ error: 'Not found' }, { status: 404 });

	let newStatus: string;
	let checkedOutAt: Date | null;
	let unpaid = false;

	if (booking.status === 'checked_out') {
		// Un-checkout
		newStatus = 'checked_in';
		checkedOutAt = null;
	} else {
		// Check out
		newStatus = 'checked_out';
		checkedOutAt = new Date();

		// Check balance
		const charged = booking.lineItems.reduce((s, li) => s + li.totalAmount, 0);
		const paid = booking.paymentEvents
			.filter(p => p.type !== 'refund').reduce((s, p) => s + p.amount, 0);
		const refunded = booking.paymentEvents
			.filter(p => p.type === 'refund').reduce((s, p) => s + p.amount, 0);
		unpaid = charged - paid + refunded > 0;

		// Mark room dirty
		if (booking.roomId) {
			await db.update(rooms)
				.set({ housekeepingStatus: 'dirty' })
				.where(eq(rooms.id, booking.roomId));
		}

		// Send receipt email if guest has an email address
		const guest = (booking as any).guest;
		const room  = (booking as any).room;
		const prop  = room?.property;
		if (guest?.email) {
			const nights = Math.max(1, Math.round(
				(new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 86400000
			));
			const origin = env.ORIGIN || url.origin;
			sendCheckoutReceipt({
				guestName:         guest.name ?? 'Guest',
				guestEmail:        guest.email,
				propertyName:      prop?.name ?? 'Hotel',
				propertyPhone:     prop?.phone ?? null,
				propertyAddress:   prop?.address ?? null,
				propertyCity:      prop?.city ?? null,
				propertyProvince:  prop?.province ?? null,
				propertyGstNumber: prop?.gstNumber ?? null,
				checkInDate:       booking.checkInDate,
				checkOutDate:      booking.checkOutDate,
				nights,
				roomNumber:        room?.roomNumber ?? null,
				roomTypeName:      room?.roomType?.name ?? null,
				lineItems: booking.lineItems.map(l => ({
					label: l.label, type: l.type, totalAmount: l.totalAmount
				})),
				payments: booking.paymentEvents
					.filter(p => (p as any).status !== 'pending')
					.map(p => ({
						type: p.type, paymentMethod: p.paymentMethod,
						amount: p.amount, receiptNumber: p.receiptNumber ?? null
					})),
				receiptUrl: booking.publicToken
					? `${origin}/receipt/${booking.publicToken}`
					: `${origin}/booking/${id}/receipt`,
			}).catch(err => console.error('[checkout] receipt email failed:', err));
		}
	}

	await db.update(bookings).set({ status: newStatus, checkedOutAt }).where(eq(bookings.id, id));

	return json({ status: newStatus, checkedOutAt: checkedOutAt?.getTime() ?? null, unpaid });
};
