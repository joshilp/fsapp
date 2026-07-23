import { redirect } from '@sveltejs/kit';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

const WINDOW = 28; // days shown at once

function addDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const offsetParam = parseInt(url.searchParams.get('offset') ?? '0', 10);
	const offset = isNaN(offsetParam) ? 0 : offsetParam;

	const startDate = addDays(today(), offset);
	const endDate   = addDays(startDate, WINDOW);

	// Build the array of ISO date strings for the window
	const days: string[] = [];
	for (let i = 0; i < WINDOW; i++) days.push(addDays(startDate, i));

	// All active rooms, ordered by room number, with type + property
	const allRooms = await db.query.rooms.findMany({
		where: eq(rooms.isActive, true),
		columns: { id: true, roomNumber: true },
		with: {
			roomType: { columns: { id: true, name: true } },
			property: { columns: { id: true, name: true } },
		},
		orderBy: (r, { asc }) => [asc(r.roomNumber)],
	});

	// Bookings overlapping with the window (non-cancelled/blocked)
	const windowBookings = await db.query.bookings.findMany({
		where: and(
			lt(bookings.checkInDate, endDate),
			gt(bookings.checkOutDate, startDate),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
		),
		columns: {
			id: true,
			roomId: true,
			checkInDate: true,
			checkOutDate: true,
			status: true,
		},
		with: {
			guest: { columns: { name: true } },
		},
	});

	return {
		startDate,
		endDate,
		days,
		offset,
		prevOffset: offset - WINDOW,
		nextOffset: offset + WINDOW,
		today: today(),
		rooms: allRooms.map(r => ({
			id: r.id,
			roomNumber: r.roomNumber,
			roomTypeName: r.roomType?.name ?? '—',
			roomTypeId: r.roomType?.id ?? '',
			propertyId: r.property?.id ?? '',
			propertyName: r.property?.name ?? '—',
		})),
		bookings: windowBookings.map(b => ({
			id: b.id,
			roomId: b.roomId,
			guestName: b.guest?.name ?? 'Guest',
			checkInDate: b.checkInDate,
			checkOutDate: b.checkOutDate,
			status: b.status,
		})),
	};
};
