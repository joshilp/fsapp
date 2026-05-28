import { redirect } from '@sveltejs/kit';
import { and, eq, inArray, isNull, ne, gte, lt, gt } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings, rooms } from '$lib/server/db/schema';

export const load: PageServerLoad = async (event) => {
	if (!event.locals.user) redirect(303, '/auth/login');

	// "today" in local wall-clock date — use server UTC which is close enough;
	// a timezone offset setting can be added later.
	const today = new Date().toISOString().slice(0, 10);

	const activeStatuses = ['reserved', 'confirmed', 'checked_in'] as const;

	const [arrivals, departures, inHouse, unassigned, allProps] = await Promise.all([
		// Arriving today (not yet checked in)
		db.query.bookings.findMany({
			where: and(
				eq(bookings.checkInDate, today),
				inArray(bookings.status, ['reserved', 'confirmed'])
			),
			with: {
				guest:    { columns: { name: true, phone: true } },
				room:     { columns: { roomNumber: true } },
				property: { columns: { id: true, name: true } },
				paymentEvents: { columns: { type: true, status: true, amount: true } },
				lineItems:     { columns: { type: true, totalAmount: true } }
			},
			orderBy: (b, { asc }) => [asc(b.checkInDate)]
		}),

		// Departing today (still checked in)
		db.query.bookings.findMany({
			where: and(
				eq(bookings.checkOutDate, today),
				eq(bookings.status, 'checked_in')
			),
			with: {
				guest:    { columns: { name: true, phone: true } },
				room:     { columns: { roomNumber: true } },
				property: { columns: { id: true, name: true } },
				paymentEvents: { columns: { type: true, status: true, amount: true } },
				lineItems:     { columns: { type: true, totalAmount: true } }
			},
			orderBy: (b, { asc }) => [asc(b.checkOutDate)]
		}),

		// Currently in-house (checked in, not departing today)
		db.query.bookings.findMany({
			where: and(
				eq(bookings.status, 'checked_in'),
				ne(bookings.checkOutDate, today)
			),
			with: {
				guest:    { columns: { name: true } },
				room:     { columns: { roomNumber: true } },
				property: { columns: { id: true, name: true } }
			},
			orderBy: (b, { asc }) => [asc(b.checkOutDate)]
		}),

		// Unassigned bookings (no room, not cancelled/blocked)
		db.query.bookings.findMany({
			where: and(
				isNull(bookings.roomId),
				inArray(bookings.status, ['reserved', 'confirmed']),
				// Only upcoming/today
				gte(bookings.checkInDate, today)
			),
			with: {
				guest:             { columns: { name: true } },
				property:          { columns: { id: true, name: true } },
				requestedRoomType: { columns: { name: true } }
			},
			orderBy: (b, { asc }) => [asc(b.checkInDate)]
		}),

		db.query.properties.findMany({
			columns: { id: true, name: true, logoUrl: true, heroImageUrl: true, accentColour: true, publicId: true, bookingEnabled: true, city: true, province: true },
			where: (p, { not, like }) => not(like(p.name, '[Test]%'))
		})
	]);

	// Compute balance for a booking's line/payment arrays
	function balance(b: { lineItems: { totalAmount: number }[]; paymentEvents: { type: string; status?: string | null; amount: number }[] }) {
		const charges = b.lineItems.reduce((s, l) => s + l.totalAmount, 0);
		const received = b.paymentEvents.filter(p => p.type !== 'refund' && (p as { status?: string | null }).status !== 'pending').reduce((s, p) => s + p.amount, 0);
		const refunded = b.paymentEvents.filter(p => p.type === 'refund').reduce((s, p) => s + p.amount, 0);
		return charges - received + refunded; // cents; positive = still owed
	}

	return {
		today,
		arrivals:   arrivals.map(b => ({ ...b, balanceCents: balance(b) })),
		departures: departures.map(b => ({ ...b, balanceCents: balance(b) })),
		inHouse,
		unassigned,
		properties: allProps,
		occupancyChart: await buildOccupancyChart(today, allProps)
	};
	};
};

// ─── 14-day occupancy chart data ──────────────────────────────────────────────

function addDays(iso: string, n: number): string {
	const d = new Date(iso + 'T12:00:00');
	d.setDate(d.getDate() + n);
	return d.toISOString().slice(0, 10);
}

async function buildOccupancyChart(
	today: string,
	props: { id: string }[]
): Promise<{ date: string; label: string; occupiedRooms: number; totalRooms: number; pct: number }[]> {
	const DAYS = 14;
	const lastDate = addDays(today, DAYS - 1);

	const allRooms = await db.query.rooms.findMany({
		where: and(inArray(rooms.propertyId, props.map(p => p.id)), eq(rooms.isActive, true)),
		columns: { id: true }
	});
	const totalRooms = allRooms.length;
	if (totalRooms === 0) return [];
	const roomIds = allRooms.map(r => r.id);

	const windowBookings = await db
		.select({ checkInDate: bookings.checkInDate, checkOutDate: bookings.checkOutDate })
		.from(bookings)
		.where(and(
			inArray(bookings.roomId, roomIds),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
			ne(bookings.status, 'checked_out'),
			lt(bookings.checkInDate, addDays(lastDate, 1)),
			gt(bookings.checkOutDate, today)
		));

	return Array.from({ length: DAYS }, (_, i) => {
		const date = addDays(today, i);
		const occupied = windowBookings.filter(b => b.checkInDate <= date && b.checkOutDate > date).length;
		return {
			date,
			label: new Date(date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' }),
			occupiedRooms: occupied,
			totalRooms,
			pct: Math.round((occupied / totalRooms) * 100)
		};
	});
}
