import { redirect } from '@sveltejs/kit';
import { and, eq, gte, gt, lt, lte, ne, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookingLineItems, bookings, paymentEvents, rooms } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const now = new Date();

	// Support custom date range (?from=YYYY-MM-DD&to=YYYY-MM-DD) OR legacy ?month=YYYY-MM
	const fromParam = url.searchParams.get('from');
	const toParam   = url.searchParams.get('to');
	const monthParam = url.searchParams.get('month');

	let rangeStart: string;
	let rangeEnd: string;   // exclusive upper bound (first day of next period)
	let rangeLabel: string;
	let isMonthMode = true;
	let year: number, month: number;

	if (fromParam && toParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && /^\d{4}-\d{2}-\d{2}$/.test(toParam) && fromParam < toParam) {
		rangeStart = fromParam;
		// rangeEnd is exclusive — add 1 day to toParam for overlap queries
		const endDate = new Date(toParam + 'T12:00:00');
		endDate.setDate(endDate.getDate() + 1);
		rangeEnd = endDate.toISOString().slice(0, 10);
		rangeLabel = `${fromParam} — ${toParam}`;
		isMonthMode = false;
		year = new Date(fromParam).getFullYear();
		month = new Date(fromParam).getMonth() + 1;
	} else {
		if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
			[year, month] = monthParam.split('-').map(Number);
		} else {
			year = now.getFullYear();
			month = now.getMonth() + 1;
		}
		month = Math.max(1, Math.min(12, month));
		rangeStart = `${year}-${String(month).padStart(2, '0')}-01`;
		const nextM = month === 12 ? 1 : month + 1;
		const nextY = month === 12 ? year + 1 : year;
		rangeEnd = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
		rangeLabel = new Date(year, month - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
	}

	const daysInRange = Math.round((new Date(rangeEnd).getTime() - new Date(rangeStart).getTime()) / 86400000);

	const allProperties = await db.query.properties.findMany({ columns: { id: true, name: true } });

	// Optional property filter
	const propFilter = url.searchParams.get('prop') ?? '';

	// All bookings that OVERLAP with this range (for accurate occupancy)
	const overlappingBookings = await db.query.bookings.findMany({
		where: and(
			lt(bookings.checkInDate, rangeEnd),
			gt(bookings.checkOutDate, rangeStart),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked'),
			...(propFilter ? [eq(bookings.propertyId, propFilter)] : [])
		),
		with: { channel: { columns: { name: true } } },
		columns: { id: true, propertyId: true, status: true, checkInDate: true, checkOutDate: true }
	});

	// Bookings that CHECK IN during this range (for revenue)
	const rangeCheckIns = overlappingBookings.filter(
		(b) => b.checkInDate >= rangeStart && b.checkInDate < rangeEnd
	);

	const bookingIds = rangeCheckIns.map((b) => b.id);
	let totalRevenueCents = 0;
	let totalTaxCents = 0;
	let totalCollectedCents = 0;
	let totalRefundedCents = 0;
	let totalRateNights = 0; // for ADR

	if (bookingIds.length > 0) {
		const [lineItems, payments] = await Promise.all([
			db.query.bookingLineItems.findMany({
				where: and(
					sql`${bookingLineItems.bookingId} IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})`,
					sql`${bookingLineItems.type} IN ('rate','extra','tax')`
				),
				columns: { bookingId: true, type: true, totalAmount: true, quantity: true }
			}),
			db.query.paymentEvents.findMany({
				where: sql`${paymentEvents.bookingId} IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})`,
				columns: { bookingId: true, type: true, amount: true }
			})
		]);
		for (const li of lineItems) {
			if (li.type === 'rate') {
				totalRevenueCents += li.totalAmount;
				totalRateNights += li.quantity ?? 0;
			} else if (li.type === 'extra') {
				totalRevenueCents += li.totalAmount;
			} else if (li.type === 'tax') {
				totalTaxCents += li.totalAmount;
			}
		}
		totalCollectedCents = payments.filter(p => p.type !== 'refund').reduce((s, p) => s + p.amount, 0);
		totalRefundedCents  = payments.filter(p => p.type === 'refund').reduce((s, p) => s + p.amount, 0);
	}

	// ADR = accommodation revenue / nights sold
	const adr = totalRateNights > 0 ? totalRevenueCents / totalRateNights / 100 : null;

	// Occupancy per property
	const propertyStats = await Promise.all(
		allProperties.map(async (prop) => {
			const propRooms = await db.query.rooms.findMany({
				where: and(eq(rooms.propertyId, prop.id), eq(rooms.isActive, true)),
				columns: { id: true }
			});
			const totalRoomNights = propRooms.length * daysInRange;
			const propBookings = overlappingBookings.filter((b) => b.propertyId === prop.id);
			const propCheckIns = rangeCheckIns.filter((b) => b.propertyId === prop.id);

			let bookedNights = 0;
			for (const b of propBookings) {
				const startMs = Math.max(new Date(b.checkInDate + 'T00:00:00').getTime(), new Date(rangeStart + 'T00:00:00').getTime());
				const endMs   = Math.min(new Date(b.checkOutDate + 'T00:00:00').getTime(), new Date(rangeEnd + 'T00:00:00').getTime());
				bookedNights += Math.max(0, Math.round((endMs - startMs) / 86400000));
			}

			const occupancyPct = totalRoomNights > 0 ? Math.round((bookedNights / totalRoomNights) * 100) : 0;
			// RevPAR = ADR × occupancy%
			const revPar = adr !== null ? adr * (occupancyPct / 100) : null;

			return {
				propertyId: prop.id,
				propertyName: prop.name,
				totalRooms: propRooms.length,
				totalBookings: propCheckIns.length,
				bookedNights,
				availableNights: totalRoomNights,
				occupancyPct,
				revPar
			};
		})
	);

	// Overall RevPAR across all properties
	const totalAvailableNights = propertyStats.reduce((s, p) => s + p.availableNights, 0);
	const totalBookedNights    = propertyStats.reduce((s, p) => s + p.bookedNights, 0);
	const overallOccupancyPct  = totalAvailableNights > 0 ? totalBookedNights / totalAvailableNights : 0;
	const revPar = adr !== null ? adr * overallOccupancyPct : null;

	// Channel breakdown
	const channelCounts: Record<string, number> = {};
	for (const b of rangeCheckIns) {
		const ch = b.channel?.name ?? 'Direct';
		channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
	}

	// Status breakdown
	const statusCounts: Record<string, number> = {};
	for (const b of rangeCheckIns) {
		statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
	}

	// 6-month trend
	const trend: { label: string; month: string; count: number }[] = [];
	for (let i = 5; i >= 0; i--) {
		let m = month - i;
		let y = year;
		while (m < 1) { m += 12; y--; }
		const ms  = `${y}-${String(m).padStart(2, '0')}-01`;
		const nm2 = m === 12 ? 1 : m + 1;
		const ny2 = m === 12 ? y + 1 : y;
		const me2 = `${ny2}-${String(nm2).padStart(2, '0')}-01`;
		const cnt = await db.query.bookings.findMany({
			where: and(
				gte(bookings.checkInDate, ms),
				lt(bookings.checkInDate, me2),
				ne(bookings.status, 'cancelled'),
				ne(bookings.status, 'blocked'),
				...(propFilter ? [eq(bookings.propertyId, propFilter)] : [])
			),
			columns: { id: true }
		});
		trend.push({
			label: new Date(y, m - 1, 1).toLocaleDateString('en-CA', { month: 'short' }),
			month: `${y}-${String(m).padStart(2, '0')}`,
			count: cnt.length
		});
	}

	const prevMonth = month === 1 ? 12 : month - 1;
	const prevYear  = month === 1 ? year - 1 : year;
	const nextM     = month === 12 ? 1 : month + 1;
	const nextY     = month === 12 ? year + 1 : year;

	return {
		year, month,
		rangeStart,
		rangeEnd: toParam ?? rangeEnd,
		isMonthMode,
		rangeLabel,
		prevMonthParam: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
		nextMonthParam: `${nextY}-${String(nextM).padStart(2, '0')}`,
		monthLabel: rangeLabel,
		propFilter,
		allProperties,
		totalBookings: rangeCheckIns.length,
		totalRevenueDollars: (totalRevenueCents / 100).toFixed(2),
		totalTaxDollars: (totalTaxCents / 100).toFixed(2),
		totalCollectedDollars: (totalCollectedCents / 100).toFixed(2),
		totalRefundedDollars: (totalRefundedCents / 100).toFixed(2),
		adr: adr !== null ? adr.toFixed(2) : null,
		revPar: revPar !== null ? revPar.toFixed(2) : null,
		channelCounts,
		statusCounts,
		propertyStats,
		trend
	};
};
