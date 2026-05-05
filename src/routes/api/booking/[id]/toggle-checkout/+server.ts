import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

/** POST /api/booking/[id]/toggle-checkout
 *  If checked_out → revert to checked_in
 *  If checked_in  → set checked_out + mark room dirty
 *  Returns { status, checkedOutAt, unpaid: boolean }
 */
export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	const id = params.id;

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, id),
		columns: { id: true, status: true, checkedOutAt: true, roomId: true },
		with: {
			lineItems: { columns: { type: true, totalAmount: true } },
			paymentEvents: { columns: { type: true, amount: true } }
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
	}

	await db.update(bookings).set({ status: newStatus, checkedOutAt }).where(eq(bookings.id, id));

	return json({ status: newStatus, checkedOutAt: checkedOutAt?.getTime() ?? null, unpaid });
};
