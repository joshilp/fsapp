import { json, error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookingChannels, bookings, rooms } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const booking = await db.query.bookings.findFirst({
		where: eq(bookings.id, params.id),
		with: {
			guest: { columns: { name: true } },
			room: {
				with: { property: { columns: { id: true, name: true } } },
				columns: { propertyId: true, roomNumber: true }
			},
			channel: { columns: { id: true, name: true } },
			lineItems: { orderBy: (li, { asc }) => [asc(li.sortOrder)] }
		},
		columns: {
			id: true, propertyId: true, roomId: true, channelId: true,
			checkInDate: true, checkOutDate: true, notes: true, status: true,
			otaConfirmationNumber: true
		}
	});

	if (!booking) throw error(404, 'Not found');

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

	return json({ booking, propertyRooms, channels });
};
