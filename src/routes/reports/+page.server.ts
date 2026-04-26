import { redirect } from '@sveltejs/kit';
import { and, eq, gte, gt, lt, lte, ne, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { bookingLineItems, bookings, paymentEvents, rooms } from '$lib/server/db/schema';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/auth/login');

	const now = new Date();
	const monthParam = url.searchParams.get('month');
	let year: number, month: number;
	if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
		[year, month] = monthParam.split('-').map(Number);
	} else {
		year = now.getFullYear();
		month = now.getMonth() + 1;
	}
	month = Math.max(1, Math.min(12, month));

	const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
	const nextM = month === 12 ? 1 : month + 1;
	const nextY = month === 12 ? year + 1 : year;
	const monthEnd = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
	const daysInMonth = new Date(year, month, 0).getDate();

	const allProperties = await db.query.properties.findMany({ columns: { id: true, name: true } });

	// All bookings that OVERLAP with this month (for accurate occupancy)
	const overlappingBookings = await db.query.bookings.findMany({
		where: and(
			lt(bookings.checkInDate, monthEnd),
			gt(bookings.checkOutDate, monthStart),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked')
		),
		with: { channel: { columns: { name: true } } },
		columns: { id: true, propertyId: true, status: true, checkInDate: true, checkOutDate: true }
	});

	// Bookings that CHECK IN this month (for revenue counting — revenue belongs to arrival month)
	const monthlyCheckIns = overlappingBookings.filter(
		(b) => b.checkInDate >= monthStart && b.checkInDate < monthEnd
	);

	// Revenue + tax from rate/tax line items for check-in-this-month bookings
	const bookingIds = monthlyCheckIns.map((b) => b.id);
	let totalRevenueCents = 0;
	let totalTaxCents = 0;
	let totalCollectedCents = 0;
	let totalRefundedCents = 0;

	if (bookingIds.length > 0) {
		const [lineItems, payments] = await Promise.all([
			db.query.bookingLineItems.findMany({
				where: and(
					sql`${bookingLineItems.bookingId} IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})`,
					sql`${bookingLineItems.type} IN ('rate','extra','tax')`
				),
				columns: { bookingId: true, type: true, totalAmount: true }
			}),
			db.query.paymentEvents.findMany({
				where: sql`${paymentEvents.bookingId} IN (${sql.join(bookingIds.map((id) => sql`${id}`), sql`, `)})`,
				columns: { bookingId: true, type: true, amount: true }
			})
		]);
		for (const li of lineItems) {
			if (li.type === 'rate' || li.type === 'extra') totalRevenueCents += li.totalAmount;
			else if (li.type === 'tax') totalTaxCents += li.totalAmount;
		}
		totalCollectedCents = payments.filter(p => p.type !== 'refund').reduce((s, p) => s + p.amount, 0);
		totalRefundedCents  = payments.filter(p => p.type === 'refund').reduce((s, p) => s + p.amount, 0);
	}

	// Occupancy per property — uses ALL overlapping bookings for accuracy
	const propertyStats = await Promise.all(
		allProperties.map(async (prop) => {
			const propRooms = await db.query.rooms.findMany({
				where: and(eq(rooms.propertyId, prop.id), eq(rooms.isActive, true)),
				columns: { id: true }
			});
			const totalRoomNights = propRooms.length * daysInMonth;
			const propBookings = overlappingBookings.filter((b) => b.propertyId === prop.id);
			const propCheckIns = monthlyCheckIns.filter((b) => b.propertyId === prop.id);

			let bookedNights = 0;
			for (const b of propBookings) {
				const startMs = Math.max(new Date(b.checkInDate + 'T00:00:00').getTime(), new Date(monthStart + 'T00:00:00').getTime());
				const endMs = Math.min(new Date(b.checkOutDate + 'T00:00:00').getTime(), new Date(monthEnd + 'T00:00:00').getTime());
				bookedNights += Math.max(0, Math.round((endMs - startMs) / 86400000));
			}

			return {
				propertyId: prop.id,
				propertyName: prop.name,
				totalRooms: propRooms.length,
				totalBookings: propCheckIns.length,
				bookedNights,
				availableNights: totalRoomNights,
				occupancyPct: totalRoomNights > 0 ? Math.round((bookedNights / totalRoomNights) * 100) : 0
			};
		})
	);

	// Channel breakdown (check-ins this month)
	const channelCounts: Record<string, number> = {};
	for (const b of monthlyCheckIns) {
		const ch = b.channel?.name ?? 'Direct';
		channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
	}

	// Booking status breakdown (check-ins this month)
	const statusCounts: Record<string, number> = {};
	for (const b of monthlyCheckIns) {
		statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
	}

	// Trend: booking count per month for last 6 months
	const trend: { label: string; month: string; count: number }[] = [];
	for (let i = 5; i >= 0; i--) {
		let m = month - i;
		let y = year;
		while (m < 1) { m += 12; y--; }
		const ms = `${y}-${String(m).padStart(2, '0')}-01`;
		const nm2 = m === 12 ? 1 : m + 1;
		const ny2 = m === 12 ? y + 1 : y;
		const me2 = `${ny2}-${String(nm2).padStart(2, '0')}-01`;
		const cnt = await db.query.bookings.findMany({
			where: and(gte(bookings.checkInDate, ms), lt(bookings.checkInDate, me2), ne(bookings.status, 'cancelled'), ne(bookings.status, 'blocked')),
			columns: { id: true }
		});
		trend.push({
			label: new Date(y, m - 1, 1).toLocaleDateString('en-CA', { month: 'short' }),
			month: `${y}-${String(m).padStart(2, '0')}`,
			count: cnt.length
		});
	}


	const prevMonth = month === 1 ? 12 : month - 1;
	const prevYear = month === 1 ? year - 1 : year;

	return {
		year, month,
		prevMonthParam: `${prevYear}-${String(prevMonth).padStart(2, '0')}`,
		nextMonthParam: `${nextY}-${String(nextM).padStart(2, '0')}`,
		monthLabel: new Date(year, month - 1, 1).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' }),
		totalBookings: monthlyCheckIns.length,
		totalRevenueDollars: (totalRevenueCents / 100).toFixed(2),
		totalTaxDollars: (totalTaxCents / 100).toFixed(2),
		totalCollectedDollars: (totalCollectedCents / 100).toFixed(2),
		totalRefundedDollars: (totalRefundedCents / 100).toFixed(2),
		channelCounts,
		statusCounts,
		propertyStats,
		trend
	};
};
