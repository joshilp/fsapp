import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gt, lt, ne, sql } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		with: {
			guest: { columns: { name: true } },
			room: {
				columns: { roomNumber: true, propertyId: true },
				with: { property: { columns: { id: true, name: true } } }
			},
			channel: { columns: { id: true } }
		},
		columns: {
			id: true,
			propertyId: true,
			roomId: true,
			channelId: true,
			checkInDate: true,
			checkOutDate: true,
			status: true,
			numAdults: true,
			numChildren: true,
			notes: true,
			clerkName: true,
			otaConfirmationNumber: true
		}
	});

	if (!booking) redirect(303, '/booking');
	// Only checked-in bookings can be moved mid-stay
	if (booking.status !== 'checked_in') redirect(303, `/booking/${params.id}/checkin`);

	const propertyRooms = await db.query.rooms.findMany({
		where: and(eq(rooms.propertyId, booking.propertyId), eq(rooms.isActive, true)),
		with: { roomType: { columns: { name: true, category: true } } },
		orderBy: sql`CAST(${rooms.roomNumber} AS INTEGER)`
	});

	return { booking, propertyRooms };
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const bookingId = params.id;
		const fd = await request.formData();
		const g = (k: string) => (fd.get(k) as string | null)?.trim() || null;

		const moveDate = g('moveDate');
		const newRoomId = g('newRoomId');
		const carryNotes = fd.get('carryNotes') === 'on';
		const moveNotes = g('moveNotes');

		if (!moveDate) return fail(400, { error: 'Move date is required' });
		if (!newRoomId) return fail(400, { error: 'New room is required' });

		// Fetch original booking for validation
		const booking = await db.query.bookings.findFirst({
			where: and(eq(bookings.id, bookingId), eq(bookings.status, 'checked_in')),
			columns: {
				id: true,
				propertyId: true,
				roomId: true,
				guestId: true,
				channelId: true,
				checkInDate: true,
				checkOutDate: true,
				numAdults: true,
				numChildren: true,
				notes: true,
				clerkName: true,
				otaConfirmationNumber: true
			}
		});
		if (!booking) return fail(404, { error: 'Booking not found or not checked in' });
		if (booking.roomId === newRoomId) return fail(400, { error: 'New room must be different from current room' });

		// Validate move date is strictly between check-in and check-out
		if (moveDate <= booking.checkInDate)
			return fail(400, { error: `Move date must be after check-in (${booking.checkInDate})` });
		if (moveDate >= booking.checkOutDate)
			return fail(400, { error: `Move date must be before check-out (${booking.checkOutDate})` });

		// Conflict check on new room for moveDate → checkOutDate
		const conflict = await db.query.bookings.findFirst({
			where: and(
				eq(bookings.roomId, newRoomId),
				lt(bookings.checkInDate, booking.checkOutDate),
				gt(bookings.checkOutDate, moveDate),
				ne(bookings.status, 'cancelled')
			),
			with: { guest: { columns: { name: true } } }
		});
		if (conflict) {
			return fail(400, {
				error: `Room already booked ${conflict.checkInDate} → ${conflict.checkOutDate}${conflict.guest ? ` (${conflict.guest.name})` : ''}`
			});
		}

		const newBookingId = crypto.randomUUID();

		// Check out original booking (guest has left that room) + link forward
		await db
			.update(bookings)
			.set({
				checkOutDate: moveDate,
				status: 'checked_out',
				checkedOutAt: new Date(),
				movedToBookingId: newBookingId
			})
			.where(eq(bookings.id, bookingId));

		// Create new booking for the new room, linked back to original
		await db.insert(bookings).values({
			id: newBookingId,
			propertyId: booking.propertyId,
			roomId: newRoomId,
			guestId: booking.guestId,
			channelId: booking.channelId,
			checkInDate: moveDate,
			checkOutDate: booking.checkOutDate,
			status: 'checked_in',
			checkedInAt: new Date(),
			numAdults: booking.numAdults,
			numChildren: booking.numChildren,
			notes: moveNotes || (carryNotes ? booking.notes : null),
			clerkName: booking.clerkName,
			otaConfirmationNumber: booking.otaConfirmationNumber,
			movedFromBookingId: bookingId
		});

		// Redirect to the new booking's registration card so operator can set rates
		redirect(303, `/booking/${newBookingId}/checkin`);
	}
};
