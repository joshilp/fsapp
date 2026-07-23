import { json, redirect } from '@sveltejs/kit';
import { and, gt, lt, ne, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookingLineItems, bookings, paymentEvents } from '$lib/server/db/schema';

export const GET: RequestHandler = async ({ locals, url }) => {
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

	// Bookings checking in this month
	const monthlyCheckIns = await db.query.bookings.findMany({
		where: and(
			lt(bookings.checkInDate, monthEnd),
			gt(bookings.checkOutDate, monthStart),
			ne(bookings.status, 'cancelled'),
			ne(bookings.status, 'blocked')
		),
		with: {
			channel: { columns: { name: true } },
			room: { columns: { roomNumber: true } },
			property: { columns: { name: true } },
			guest: { columns: { name: true, phone: true, email: true } }
		},
		columns: {
			id: true,
			propertyId: true,
			status: true,
			checkInDate: true,
			checkOutDate: true,
			guestName: true,
			guestEmail: true,
			guestPhone: true,
			adults: true,
			children: true,
			notes: true,
			otaConfirmation: true
		}
	});

	const bookingIds = monthlyCheckIns.map((b) => b.id);

	let lineItemsMap = new Map<string, { rate: number; tax: number; extra: number }>();
	let paymentsMap = new Map<string, { collected: number; refunded: number }>();

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
			const cur = lineItemsMap.get(li.bookingId) ?? { rate: 0, tax: 0, extra: 0 };
			if (li.type === 'rate') cur.rate += li.totalAmount;
			else if (li.type === 'tax') cur.tax += li.totalAmount;
			else if (li.type === 'extra') cur.extra += li.totalAmount;
			lineItemsMap.set(li.bookingId, cur);
		}
		for (const p of payments) {
			const cur = paymentsMap.get(p.bookingId) ?? { collected: 0, refunded: 0 };
			if (p.type === 'refund') cur.refunded += p.amount;
			else cur.collected += p.amount;
			paymentsMap.set(p.bookingId, cur);
		}
	}

	// Build CSV
	const fmt = (cents: number) => (cents / 100).toFixed(2);
	const esc = (s: string | null | undefined) => {
		if (!s) return '';
		if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
		return s;
	};

	const rows: string[] = [
		[
			'Property', 'Room', 'Guest Name', 'Phone', 'Email',
			'Check-In', 'Check-Out', 'Nights', 'Adults', 'Children',
			'Rate ($)', 'Extra ($)', 'Tax ($)', 'Total ($)',
			'Collected ($)', 'Refunded ($)', 'Balance ($)',
			'Status', 'Channel', 'OTA Ref', 'Notes'
		].join(',')
	];

	for (const b of monthlyCheckIns) {
		const nights = Math.max(0, Math.round(
			(new Date(b.checkOutDate + 'T00:00:00').getTime() - new Date(b.checkInDate + 'T00:00:00').getTime()) / 86400000
		));
		const li = lineItemsMap.get(b.id) ?? { rate: 0, tax: 0, extra: 0 };
		const pay = paymentsMap.get(b.id) ?? { collected: 0, refunded: 0 };
		const total = li.rate + li.extra + li.tax;
		const balance = total - pay.collected + pay.refunded;

		rows.push([
			esc(b.property?.name),
			esc(b.room?.roomNumber),
			esc(b.guest?.name ?? b.guestName),
			esc(b.guest?.phone ?? b.guestPhone),
			esc(b.guest?.email ?? b.guestEmail),
			b.checkInDate,
			b.checkOutDate,
			String(nights),
			String(b.adults ?? 1),
			String(b.children ?? 0),
			fmt(li.rate),
			fmt(li.extra),
			fmt(li.tax),
			fmt(total),
			fmt(pay.collected),
			fmt(pay.refunded),
			fmt(balance),
			esc(b.status),
			esc(b.channel?.name ?? 'Direct'),
			esc(b.otaConfirmation),
			esc(b.notes)
		].join(','));
	}

	const csv = rows.join('\r\n');
	const filename = `bookings-${year}-${String(month).padStart(2, '0')}.csv`;

	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
