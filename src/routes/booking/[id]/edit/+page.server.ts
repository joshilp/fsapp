import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gt, lt, ne, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookingChannels, bookings, rooms } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		with: {
			guest: { columns: { name: true } },
			room: {
				with: { property: { columns: { id: true, name: true } } },
				columns: { propertyId: true, roomNumber: true }
			},
			channel: { columns: { id: true, name: true } }
		},
		columns: {
			id: true,
			propertyId: true,
			roomId: true,
			channelId: true,
			checkInDate: true,
			checkOutDate: true,
			notes: true,
			status: true,
			otaConfirmationNumber: true
		}
	});

	if (!booking || booking.status === 'checked_out' || booking.status === 'cancelled') {
		redirect(303, '/booking');
	}

	const [propertyRooms, channels] = await Promise.all([
		db.query.rooms.findMany({
			where: and(eq(rooms.propertyId, booking.propertyId), eq(rooms.isActive, true)),
			orderBy: sql`CAST(${rooms.roomNumber} AS INTEGER)`
		}),
		db.query.bookingChannels.findMany({
			where: eq(bookingChannels.isActive, true),
			orderBy: (t, { asc }) => [asc(t.sortOrder)]
		})
	]);

	return { booking, propertyRooms, channels };
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const bookingId = params.id;
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const checkIn = g('checkIn');
		const checkOut = g('checkOut');
		const roomId = g('roomId');
		const channelId = g('channelId');
		const notes = g('notes');
		const otaConfirmationNumber = g('otaConfirmationNumber');

		if (!checkIn || !checkOut) return fail(400, { error: 'Dates are required' });
		if (checkIn >= checkOut) return fail(400, { error: 'Check-out must be after check-in' });

		// Conflict check: new room + new dates (excluding this booking)
		if (roomId) {
			const conflict = await db.query.bookings.findFirst({
				where: and(
					eq(bookings.roomId, roomId),
					lt(bookings.checkInDate, checkOut),
					gt(bookings.checkOutDate, checkIn),
					ne(bookings.status, 'cancelled'),
					ne(bookings.id, bookingId)
				),
				with: { guest: { columns: { name: true } } }
			});
			if (conflict) {
				return fail(400, {
					error: `Room already booked ${conflict.checkInDate} → ${conflict.checkOutDate}${conflict.guest ? ` (${conflict.guest.name})` : ''}`
				});
			}
		}

		await db
			.update(bookings)
			.set({
				checkInDate: checkIn,
				checkOutDate: checkOut,
				roomId: roomId ?? undefined,
				channelId: channelId ?? undefined,
				notes,
				otaConfirmationNumber
			})
			.where(eq(bookings.id, bookingId));

		const [y, m] = checkIn.split('-');
		redirect(303, `/booking?month=${y}-${m}`);
	}
};
