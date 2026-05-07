import { redirect } from '@sveltejs/kit';
import { and, eq, inArray, isNull, ne, gte } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookings } from '$lib/server/db/schema';

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
			columns: { id: true, name: true }
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
		properties: allProps
	};
};
