/**
 * Demo booking seed — pnpm db:seed:demo
 *
 * Inserts ~20 realistic-looking bookings spread across the current month for
 * both properties, covering all channels, states, and edge cases (overflow,
 * multi-night, back-to-back, etc.) so the grid renders with visible content.
 *
 * Pass --reset to wipe demo bookings and guests before re-inserting.
 * Safe to run repeatedly without --reset (onConflictDoNothing).
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq, like } from 'drizzle-orm';
import { resolve } from 'path';
import * as schema from '../src/lib/server/db/schema.ts';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(resolve(DB_URL));
const db = drizzle(client, { schema });

const reset = process.argv.includes('--reset');

// ─── Reset ────────────────────────────────────────────────────────────────────

if (reset) {
	await db.delete(schema.bookings).where(like(schema.bookings.id, 'demo-%'));
	await db.delete(schema.guests).where(like(schema.guests.id, 'demo-%'));
	console.log('✓ Cleared demo bookings and guests');
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;

function d(day: number, offsetMonths = 0): string {
	let m = month + offsetMonths;
	let y = year;
	while (m > 12) { m -= 12; y++; }
	while (m < 1)  { m += 12; y--; }
	const daysInMonth = new Date(y, m, 0).getDate();
	const clampedDay = Math.min(day, daysInMonth);
	return `${y}-${String(m).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

// ─── Guests ───────────────────────────────────────────────────────────────────

const guests = [
	{ id: 'demo-g-01', name: 'John & Mary Doe',     phone: '555-100-0001', city: 'Calgary',   provinceState: 'AB' },
	{ id: 'demo-g-02', name: 'Robert Smith',         phone: '555-100-0002', city: 'Vancouver', provinceState: 'BC' },
	{ id: 'demo-g-03', name: 'The Nguyen Family',    phone: '555-100-0003', city: 'Edmonton',  provinceState: 'AB' },
	{ id: 'demo-g-04', name: 'Patricia Williams',    phone: '555-100-0004', city: 'Toronto',   provinceState: 'ON' },
	{ id: 'demo-g-05', name: 'James & Linda Brown',  phone: '555-100-0005', city: 'Regina',    provinceState: 'SK' },
	{ id: 'demo-g-06', name: 'Chen Wei',             phone: '555-100-0006', city: 'Burnaby',   provinceState: 'BC' },
	{ id: 'demo-g-07', name: 'Anderson Group x8',   phone: '555-100-0007', city: 'Saskatoon', provinceState: 'SK' },
	{ id: 'demo-g-08', name: 'Maria Garcia',         phone: '555-100-0008', city: 'Kelowna',   provinceState: 'BC' },
	{ id: 'demo-g-09', name: 'David & Sue Park',     phone: '555-100-0009', city: 'Lethbridge',provinceState: 'AB' },
	{ id: 'demo-g-10', name: 'Thompson, K.',          phone: '555-100-0010', city: 'Winnipeg',  provinceState: 'MB' },
	{ id: 'demo-g-11', name: 'Patel Family',         phone: '555-100-0011', city: 'Surrey',    provinceState: 'BC' },
	{ id: 'demo-g-12', name: 'Olga Ivanova',         phone: '555-100-0012', city: 'Victoria',  provinceState: 'BC' },
];

await db.insert(schema.guests).values(guests).onConflictDoNothing();
console.log(`✓ ${guests.length} demo guests`);

// ─── Bookings ─────────────────────────────────────────────────────────────────
// Format: id, propertyId, roomId, guestId, channelId, status, checkIn, checkOut,
//         adults, children, notes

type BookingSpec = {
	id: string;
	propertyId: string;
	roomId: string;
	guestId: string;
	channelId: string;
	status: 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
	checkIn: string;
	checkOut: string;
	adults?: number;
	children?: number;
	notes?: string;
};

const bookingSpecs: BookingSpec[] = [
	// ── Falcon Motel ────────────────────────────────────────────────────────
	// Room 1 (C): overflow from last month → check out mid-month
	{ id: 'demo-b-01', propertyId: 'prop-falcon', roomId: 'room-falcon-1',
	  guestId: 'demo-g-01', channelId: 'ch-direct',
	  status: 'checked_in', checkIn: d(25, -1), checkOut: d(5), adults: 2 },

	// Room 3 (C): arriving early month, 7 nights — Direct
	{ id: 'demo-b-02', propertyId: 'prop-falcon', roomId: 'room-falcon-3',
	  guestId: 'demo-g-02', channelId: 'ch-direct',
	  status: 'confirmed', checkIn: d(3), checkOut: d(10), adults: 2, children: 1 },

	// Room 3 (C): back-to-back — arrives day 10
	{ id: 'demo-b-03', propertyId: 'prop-falcon', roomId: 'room-falcon-3',
	  guestId: 'demo-g-05', channelId: 'ch-expedia',
	  status: 'confirmed', checkIn: d(10), checkOut: d(14), adults: 2,
	  notes: 'E - late arrival, called ahead' },

	// Room 7 (C): Expedia, checked in
	{ id: 'demo-b-04', propertyId: 'prop-falcon', roomId: 'room-falcon-7',
	  guestId: 'demo-g-03', channelId: 'ch-expedia',
	  status: 'checked_in', checkIn: d(1), checkOut: d(8), adults: 2, children: 2 },

	// Room 9 (C): Booking.com, mid-month
	{ id: 'demo-b-05', propertyId: 'prop-falcon', roomId: 'room-falcon-9',
	  guestId: 'demo-g-04', channelId: 'ch-booking-com',
	  status: 'confirmed', checkIn: d(12), checkOut: d(16), adults: 1 },

	// Room 21 (A): short 3-night confirmed
	{ id: 'demo-b-06', propertyId: 'prop-falcon', roomId: 'room-falcon-21',
	  guestId: 'demo-g-06', channelId: 'ch-direct',
	  status: 'confirmed', checkIn: d(7), checkOut: d(10), adults: 2 },

	// Room 22 (A): arrives near end of month, overflows into next
	{ id: 'demo-b-07', propertyId: 'prop-falcon', roomId: 'room-falcon-22',
	  guestId: 'demo-g-07', channelId: 'ch-direct',
	  status: 'confirmed', checkIn: d(27), checkOut: d(4, 1), adults: 4,
	  notes: 'Group — extra towels requested' },

	// Room 30 (B): checked out earlier this month (visible at month start)
	{ id: 'demo-b-08', propertyId: 'prop-falcon', roomId: 'room-falcon-30',
	  guestId: 'demo-g-08', channelId: 'ch-booking-com',
	  status: 'checked_out', checkIn: d(1), checkOut: d(6), adults: 2 },

	// Room 30 (B): back-to-back after checkout
	{ id: 'demo-b-09', propertyId: 'prop-falcon', roomId: 'room-falcon-30',
	  guestId: 'demo-g-09', channelId: 'ch-direct',
	  status: 'confirmed', checkIn: d(6), checkOut: d(11), adults: 2, children: 1 },

	// Room 32 (B): Expedia, long stay
	{ id: 'demo-b-10', propertyId: 'prop-falcon', roomId: 'room-falcon-32',
	  guestId: 'demo-g-10', channelId: 'ch-expedia',
	  status: 'confirmed', checkIn: d(15), checkOut: d(25), adults: 2 },

	// ── Spanish Fiesta ───────────────────────────────────────────────────────
	// Room 2 (C): overflow from last month
	{ id: 'demo-b-11', propertyId: 'prop-spanish', roomId: 'room-spanish-2',
	  guestId: 'demo-g-11', channelId: 'ch-direct',
	  status: 'checked_in', checkIn: d(28, -1), checkOut: d(3), adults: 2, children: 2 },

	// Room 5 (C): Booking.com, mid-month
	{ id: 'demo-b-12', propertyId: 'prop-spanish', roomId: 'room-spanish-5',
	  guestId: 'demo-g-12', channelId: 'ch-booking-com',
	  status: 'confirmed', checkIn: d(8), checkOut: d(13), adults: 2 },

	// Room 9 (C): Expedia, checked in
	{ id: 'demo-b-13', propertyId: 'prop-spanish', roomId: 'room-spanish-9',
	  guestId: 'demo-g-01', channelId: 'ch-expedia',
	  status: 'checked_in', checkIn: d(4), checkOut: d(9), adults: 2,
	  notes: 'E - repeat guest' },

	// Room 12 (D — 3 bed): large family group, long stay
	{ id: 'demo-b-14', propertyId: 'prop-spanish', roomId: 'room-spanish-12',
	  guestId: 'demo-g-07', channelId: 'ch-direct',
	  status: 'confirmed', checkIn: d(10), checkOut: d(20), adults: 4, children: 3,
	  notes: 'Large family — request ground floor if possible' },

	// Room 17 (A): short stay, direct
	{ id: 'demo-b-15', propertyId: 'prop-spanish', roomId: 'room-spanish-17',
	  guestId: 'demo-g-02', channelId: 'ch-direct',
	  status: 'confirmed', checkIn: d(5), checkOut: d(8), adults: 1 },

	// Room 23 (A): Booking.com, near end, overflows
	{ id: 'demo-b-16', propertyId: 'prop-spanish', roomId: 'room-spanish-23',
	  guestId: 'demo-g-03', channelId: 'ch-booking-com',
	  status: 'confirmed', checkIn: d(26), checkOut: d(3, 1), adults: 2 },

	// Room 27 (A): Expedia, mid-month
	{ id: 'demo-b-17', propertyId: 'prop-spanish', roomId: 'room-spanish-27',
	  guestId: 'demo-g-04', channelId: 'ch-expedia',
	  status: 'confirmed', checkIn: d(14), checkOut: d(18), adults: 1 },

	// Room 32 (A): direct, late month
	{ id: 'demo-b-18', propertyId: 'prop-spanish', roomId: 'room-spanish-32',
	  guestId: 'demo-g-06', channelId: 'ch-direct',
	  status: 'confirmed', checkIn: d(20), checkOut: d(24), adults: 2, children: 1 },

	// Room 35 (A): checked out
	{ id: 'demo-b-19', propertyId: 'prop-spanish', roomId: 'room-spanish-35',
	  guestId: 'demo-g-08', channelId: 'ch-direct',
	  status: 'checked_out', checkIn: d(1), checkOut: d(5), adults: 2 },

	// Room 3 (C): back-to-back on Spanish
	{ id: 'demo-b-20', propertyId: 'prop-spanish', roomId: 'room-spanish-3',
	  guestId: 'demo-g-09', channelId: 'ch-direct',
	  status: 'confirmed', checkIn: d(16), checkOut: d(23), adults: 2, children: 2 },
];

await db
	.insert(schema.bookings)
	.values(
		bookingSpecs.map((b) => ({
			id: b.id,
			propertyId: b.propertyId,
			roomId: b.roomId,
			guestId: b.guestId,
			channelId: b.channelId,
			status: b.status,
			checkInDate: b.checkIn,
			checkOutDate: b.checkOut,
			numAdults: b.adults ?? 1,
			numChildren: b.children ?? 0,
			notes: b.notes ?? null,
			checkedInAt: b.status === 'checked_in' ? new Date() : null,
			checkedOutAt: b.status === 'checked_out' ? new Date() : null
		}))
	)
	.onConflictDoNothing();

console.log(`✓ ${bookingSpecs.length} demo bookings`);

// ─── Done ─────────────────────────────────────────────────────────────────────

client.close();
console.log('\nDemo seed complete. Run `pnpm dev` and go to /booking to see the grid.');
console.log('To reset and re-run: pnpm db:seed:reset');
