import { json, error } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

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
			id: true, propertyId: true, roomId: true, channelId: true,
			checkInDate: true, checkOutDate: true, status: true,
			numAdults: true, numChildren: true, notes: true,
			clerkName: true, otaConfirmationNumber: true
		}
	});

	if (!booking) throw error(404, 'Not found');

	const propertyRooms = await db.query.rooms.findMany({
		where: and(eq(rooms.propertyId, booking.propertyId), eq(rooms.isActive, true)),
		with: { roomType: { columns: { name: true, category: true } } },
		orderBy: sql`CAST(${rooms.roomNumber} AS INTEGER)`
	});

	return json({ booking, propertyRooms });
};
