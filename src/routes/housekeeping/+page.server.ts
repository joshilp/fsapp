import { redirect } from '@sveltejs/kit';
import { and, eq, gt, isNotNull, lt, ne, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const today = new Date().toISOString().slice(0, 10);

	const allRooms = await db.query.rooms.findMany({
		where: eq(rooms.isActive, true),
		with: {
			property: { columns: { id: true, name: true } },
			roomType: { columns: { name: true, category: true } }
		},
		columns: {
			id: true,
			roomNumber: true,
			housekeepingStatus: true,
			numRooms: true,
			kingBeds: true,
			queenBeds: true,
			doubleBeds: true,
			hasHideabed: true,
			hasKitchen: true
		},
		orderBy: (r, { asc }) => [asc(r.propertyId), sql`CAST(${r.roomNumber} AS INTEGER)`]
	});

	// Get today's current guests (checked_in) and today's checkouts and check-ins
	const relevantBookings = await db.query.bookings.findMany({
		where: and(
			ne(bookings.status, 'cancelled'),
			isNotNull(bookings.roomId),
			lt(bookings.checkInDate, today + '\uffff'), // string compare — anything <= today
			gt(bookings.checkOutDate, sql`date('now', '-1 day')`)
		),
		with: { guest: { columns: { name: true } } },
		columns: {
			id: true,
			roomId: true,
			status: true,
			checkInDate: true,
			checkOutDate: true
		}
	});

	// Build a map: roomId → current booking summary
	const bookingByRoom = new Map<string, {
		guestName: string | null;
		status: string;
		checkInDate: string;
		checkOutDate: string;
		isCheckout: boolean;
		isCheckin: boolean;
	}>();
	for (const b of relevantBookings) {
		if (!b.roomId) continue;
		// Prefer checked_in status; also show confirmed arriving today
		const isCheckout = b.checkOutDate === today;
		const isCheckin = b.checkInDate === today;
		const existing = bookingByRoom.get(b.roomId);
		if (!existing || b.status === 'checked_in') {
			bookingByRoom.set(b.roomId, {
				guestName: b.guest?.name ?? null,
				status: b.status,
				checkInDate: b.checkInDate,
				checkOutDate: b.checkOutDate,
				isCheckout,
				isCheckin
			});
		}
	}

	// Attach booking info to rooms
	const roomsWithBooking = allRooms.map(r => ({
		...r,
		booking: bookingByRoom.get(r.id) ?? null
	}));

	// Group by property
	const byProperty = new Map<string, { name: string; rooms: typeof roomsWithBooking }>();
	for (const r of roomsWithBooking) {
		const pid = r.property.id;
		if (!byProperty.has(pid)) byProperty.set(pid, { name: r.property.name, rooms: [] });
		byProperty.get(pid)!.rooms.push(r);
	}

	return {
		today,
		properties: [...byProperty.entries()].map(([id, v]) => ({ id, ...v }))
	};
};
