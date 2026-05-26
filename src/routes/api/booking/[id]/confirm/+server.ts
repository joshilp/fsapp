/**
 * POST /api/booking/[id]/confirm
 * Promotes a booking from 'reserved' (Pending) to 'confirmed'.
 * On confirm: auto-sends guest confirmation email + generates self check-in token.
 * Also handles undo: 'confirmed' → 'reserved' if body.undo === true.
 */
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';
import { sendGuestConfirmation } from '$lib/server/email';
import { env } from '$env/dynamic/private';
import { nanoid } from 'nanoid';

export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const body = await request.json().catch(() => ({}));
	const undo = body?.undo === true;

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		columns: {
			id: true, status: true, checkInDate: true, checkOutDate: true,
			selfCheckinToken: true, confirmationSentAt: true,
			requestedRoomTypeId: true,
		},
		with: {
			guest: { columns: { name: true, email: true } },
			property: { columns: { name: true, publicId: true } },
			room: { with: { roomType: { columns: { name: true } } } },
			lineItems: { columns: { type: true, totalAmount: true } },
		}
	});
	if (!booking) return json({ error: 'Not found' }, { status: 404 });

	let newStatus: string;
	if (undo) {
		if (booking.status !== 'confirmed') return json({ error: 'Booking is not confirmed' }, { status: 400 });
		newStatus = 'reserved';
		await db.update(bookings).set({ status: newStatus }).where(eq(bookings.id, params.id));
		return json({ status: newStatus });
	}

	if (booking.status !== 'reserved') return json({ error: 'Booking is not pending' }, { status: 400 });
	newStatus = 'confirmed';

	// Auto-generate self check-in token if not already present
	const token = booking.selfCheckinToken ?? nanoid(32);
	const updates: Record<string, unknown> = {
		status: newStatus,
		selfCheckinToken: token,
	};

	await db.update(bookings).set(updates).where(eq(bookings.id, params.id));

	// Auto-send confirmation email (fire-and-forget; skip if already sent or no email)
	const guest = (booking as any).guest;
	const prop  = (booking as any).property;
	if (guest?.email && !booking.confirmationSentAt) {
		const nights = Math.max(1, Math.round(
			(new Date(booking.checkOutDate).getTime() - new Date(booking.checkInDate).getTime()) / 86400000
		));
		const origin = env.ORIGIN || url.origin;
		const roomTypeName = (booking as any).room?.roomType?.name
			?? ((booking as any).requestedRoomTypeId ? 'Room' : null);
		const charges = (booking as any).lineItems ?? [];
		const total = charges.filter((l: {type:string}) => l.type !== 'refund')
			.reduce((s: number, l: {totalAmount:number}) => s + l.totalAmount, 0);

		sendGuestConfirmation({
			guestName:         guest.name ?? 'Guest',
			guestEmail:        guest.email,
			propertyName:      prop?.name ?? 'Hotel',
			checkInDate:       booking.checkInDate,
			checkOutDate:      booking.checkOutDate,
			nights,
			requestedRoomType: roomTypeName,
			quotedTotalCents:  total || null,
			publicToken:       params.id.slice(0, 8).toUpperCase(),
			confirmationUrl:   `${origin}/booking/${params.id}/receipt`,
		}).then(() => {
			db.update(bookings)
				.set({ confirmationSentAt: new Date() })
				.where(eq(bookings.id, params.id))
				.catch(() => {});
		}).catch(err => console.error('[confirm] email failed:', err));
	}

	return json({ status: newStatus, selfCheckinToken: token });
};
