/**
 * Seed script — run with: pnpm db:seed
 *
 * Idempotent: uses onConflictDoNothing() throughout, so re-running is safe.
 * Uses stable string IDs so records are predictable and diffable.
 *
 * Seed data is derived from the HTML exports in .dev/Falcon-Spanish/:
 *   Falcon.html, Spanish Fiesta.html, Rates.html
 *
 * Property addresses and GST numbers are placeholders — update in Settings.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { resolve } from 'path';
import * as schema from '../src/lib/server/db/schema.ts';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL is not set — run with --env-file=.env');

const client = new Database(resolve(DB_URL));
const db = drizzle(client, { schema });

// ─── IDs ─────────────────────────────────────────────────────────────────────

const FALCON = 'prop-falcon';
const SPANISH = 'prop-spanish';

const RT = {
	falconA: 'rt-falcon-A',
	falconB: 'rt-falcon-B',
	falconC: 'rt-falcon-C',
	falconD: 'rt-falcon-D',
	spanishA: 'rt-spanish-A',
	spanishB: 'rt-spanish-B',
	spanishC: 'rt-spanish-C',
	spanishD: 'rt-spanish-D'
} as const;

const CH = {
	direct: 'ch-direct',
	expedia: 'ch-expedia',
	bookingCom: 'ch-booking-com'
} as const;

// ─── Properties ──────────────────────────────────────────────────────────────

await db
	.insert(schema.properties)
	.values([
		{
			id: FALCON,
			name: 'Falcon Motel',
			address: '[Address]',
			city: '[City]',
			province: 'BC',
			postalCode: '[Postal Code]',
			phone: '[Phone]',
			website: '[Website]',
			gstNumber: '[GST Number]',
			checkinTime: '14:00',
			checkoutTime: '10:30',
			policyText: 'This property is privately owned and operated.',
			cancellationPolicy:
				'Cancellation up to 30 days notice: $25.00 fee. Less than 30 days notice: NO REFUND.',
			earlyDeparturePolicy: 'Reserved units not staying full term will be charged one extra night.',
			smokingFee: 15000
		},
		{
			id: SPANISH,
			name: 'Spanish Fiesta Motel',
			address: '[Address]',
			city: '[City]',
			province: 'BC',
			postalCode: '[Postal Code]',
			phone: '[Phone]',
			website: '[Website]',
			gstNumber: '[GST Number]',
			checkinTime: '14:00',
			checkoutTime: '10:30',
			policyText: 'This property is privately owned and operated.',
			cancellationPolicy:
				'Cancellation up to 30 days notice: $25.00 fee. Less than 30 days notice: NO REFUND.',
			earlyDeparturePolicy: 'Reserved units not staying full term will be charged one extra night.',
			smokingFee: 15000
		}
	])
	.onConflictDoNothing();

console.log('✓ Properties');

// ─── Room Types ───────────────────────────────────────────────────────────────

await db
	.insert(schema.roomTypes)
	.values([
		{ id: RT.falconA, propertyId: FALCON, name: '1 Bed', category: 'A', sortOrder: 0 },
		{ id: RT.falconB, propertyId: FALCON, name: '2 Bed', category: 'B', sortOrder: 1 },
		{ id: RT.falconC, propertyId: FALCON, name: '2 Bed + Kitchen', category: 'C', sortOrder: 2 },
		{ id: RT.falconD, propertyId: FALCON, name: '3 Bed + Kitchen', category: 'D', sortOrder: 3 },
		{ id: RT.spanishA, propertyId: SPANISH, name: '1 Bed', category: 'A', sortOrder: 0 },
		{ id: RT.spanishB, propertyId: SPANISH, name: '2 Bed', category: 'B', sortOrder: 1 },
		{ id: RT.spanishC, propertyId: SPANISH, name: '2 Bed + Kitchen', category: 'C', sortOrder: 2 },
		{ id: RT.spanishD, propertyId: SPANISH, name: '3 Bed + Kitchen', category: 'D', sortOrder: 3 }
	])
	.onConflictDoNothing();

console.log('✓ Room types');

// ─── Rooms ────────────────────────────────────────────────────────────────────
// Room type is assigned by: 3RM+K→D, 2RM+K→C, 2RM-K→B, 1RM→A
// Operator can reassign via Settings if needed.
//
// Weights default to 5/5. Operator should tune these in Settings.
// Source: Falcon.html and Spanish Fiesta.html

type RoomRow = {
	id: string;
	propertyId: string;
	roomTypeId: string;
	roomNumber: string;
	numRooms: number;
	hasKitchen: boolean;
	queenBeds: number;
	doubleBeds: number;
	hasHideabed: boolean;
};

function roomTypeId(propRooms: { A: string; B: string; C: string; D: string }, numRooms: number, hasKitchen: boolean): string {
	if (numRooms >= 3 && hasKitchen) return propRooms.D;
	if (numRooms >= 2 && hasKitchen) return propRooms.C;
	if (numRooms >= 2 && !hasKitchen) return propRooms.B;
	return propRooms.A;
}

const falconTypes = { A: RT.falconA, B: RT.falconB, C: RT.falconC, D: RT.falconD };
const spanishTypes = { A: RT.spanishA, B: RT.spanishB, C: RT.spanishC, D: RT.spanishD };

// Falcon Motel — 29 rooms (non-consecutive numbers up to 36)
// Source: Falcon.html — Room No. | No. of Rooms | Kitchen | Queen | Double | HB
const falconRoomData: [string, number, number, number, number, number][] = [
	['1',  2, 1, 2, 0, 1],
	['8',  2, 1, 2, 0, 1],
	['19', 2, 1, 2, 0, 1],
	['35', 2, 1, 2, 0, 1],
	['36', 2, 1, 2, 0, 1],
	['3',  2, 1, 1, 2, 0],
	['20', 2, 1, 1, 2, 0],
	['29', 2, 1, 1, 2, 0],
	['34', 2, 1, 0, 2, 1],
	['2',  2, 1, 0, 2, 0],
	['4',  2, 1, 0, 2, 0],
	['5',  2, 1, 0, 2, 0],
	['6',  2, 1, 0, 2, 0],
	['7',  2, 1, 0, 2, 0],
	['9',  2, 1, 0, 2, 0],
	['10', 2, 1, 0, 2, 0],
	['11', 2, 1, 0, 2, 0],
	['25', 2, 1, 0, 2, 0],
	['26', 2, 1, 0, 2, 0],
	['27', 2, 1, 0, 2, 0],
	['28', 2, 1, 0, 2, 0],
	['21', 1, 1, 1, 0, 0],
	['22', 1, 1, 1, 0, 0],
	['23', 1, 1, 1, 0, 0],
	['24', 1, 1, 1, 0, 0],
	['30', 2, 0, 1, 1, 0],
	['31', 2, 0, 1, 1, 0],
	['32', 2, 0, 1, 1, 0],
	['33', 2, 0, 1, 1, 0]
];

// Spanish Fiesta Motel — 35 rooms (1–36, no room 13)
// Source: Spanish Fiesta.html
const spanishRoomData: [string, number, number, number, number, number][] = [
	['1',  1, 1, 1, 0, 1],
	['2',  2, 1, 2, 0, 0],
	['3',  2, 1, 2, 0, 0],
	['4',  2, 1, 2, 0, 0],
	['5',  2, 1, 2, 0, 0],
	['6',  1, 1, 2, 0, 0],
	['7',  1, 1, 1, 0, 1],
	['8',  1, 1, 1, 0, 1],
	['9',  2, 1, 2, 0, 0],
	['10', 2, 1, 2, 0, 0],
	['11', 2, 1, 2, 0, 0],
	['12', 3, 1, 2, 0, 1],
	['14', 2, 1, 2, 0, 0],
	['15', 2, 1, 2, 0, 0],
	['16', 1, 1, 2, 0, 1],
	['17', 1, 0, 1, 0, 1],
	['18', 1, 1, 1, 0, 1],
	['19', 1, 1, 1, 0, 1],
	['20', 1, 1, 1, 0, 1],
	['21', 1, 0, 1, 0, 1],
	['22', 1, 0, 1, 0, 1],
	['23', 1, 0, 2, 0, 0],
	['24', 1, 0, 1, 0, 1],
	['25', 1, 0, 1, 0, 1],
	['26', 1, 0, 1, 0, 1],
	['27', 1, 1, 2, 0, 1],
	['28', 1, 0, 2, 0, 0],
	['29', 1, 0, 2, 0, 0],
	['30', 1, 0, 2, 0, 0],
	['31', 1, 0, 1, 0, 1],
	['32', 1, 1, 2, 0, 1],
	['33', 1, 1, 1, 1, 0],
	['34', 1, 0, 1, 1, 0],
	['35', 1, 1, 2, 0, 1],
	['36', 1, 0, 0, 2, 1]
];

const falconRooms: RoomRow[] = falconRoomData.map(([num, nr, k, q, d, hb]) => ({
	id: `room-falcon-${num}`,
	propertyId: FALCON,
	roomTypeId: roomTypeId(falconTypes, nr, k === 1),
	roomNumber: num,
	numRooms: nr,
	hasKitchen: k === 1,
	queenBeds: q,
	doubleBeds: d,
	hasHideabed: hb === 1
}));

const spanishRooms: RoomRow[] = spanishRoomData.map(([num, nr, k, q, d, hb]) => ({
	id: `room-spanish-${num}`,
	propertyId: SPANISH,
	roomTypeId: roomTypeId(spanishTypes, nr, k === 1),
	roomNumber: num,
	numRooms: nr,
	hasKitchen: k === 1,
	queenBeds: q,
	doubleBeds: d,
	hasHideabed: hb === 1
}));

await db.insert(schema.rooms).values([...falconRooms, ...spanishRooms]).onConflictDoNothing();

console.log(`✓ Rooms (${falconRooms.length} Falcon, ${spanishRooms.length} Spanish Fiesta)`);

// ─── Rate Seasons & Tiers ─────────────────────────────────────────────────────
// Derived from Rates.html (2026 calendar, colour-coded cells).
// Colour legend from the spreadsheet:
//   #b7fab7 green  → Low:           A=$79  B=$89  C=$99
//   #e5beff purple → Shoulder Mid:  A=$110 B=$129 C=$149
//   #ffacac pink   → Shoulder Low:  A=$99  B=$110 C=$139
//   #adccff blue   → Mid:           A=$129 B=$139 C=$159
//   #fce5cd peach  → Shoulder High: A=$89  B=$99  C=$110
//   #ffff00 yellow → Peak High:     A=$189 B=$199 C=$210 D=$259
//   #ea4335 red    → Peak Top:      A=$199 B=$210 C=$229
//
// Rates are in cents. Rm D only priced during Peak High seasons.

type SeasonSpec = {
	name: string;
	colour: string;
	start: string;
	end: string;
	minNights?: number; // default 1; 3 for peak long-weekend seasons
	rates: { A: number; B: number; C: number; D: number | null };
};

const seasons: SeasonSpec[] = [
	{
		name: 'Low — Jan to Mar',
		colour: '#b7fab7',
		start: '2026-01-01',
		end: '2026-03-31',
		rates: { A: 7900, B: 8900, C: 9900, D: null }
	},
	{
		name: 'Shoulder — Apr (pre-Easter)',
		colour: '#ffacac',
		start: '2026-04-01',
		end: '2026-04-01',
		rates: { A: 9900, B: 11000, C: 13900, D: null }
	},
	{
		name: 'Shoulder — Easter',
		colour: '#e5beff',
		start: '2026-04-02',
		end: '2026-04-06',
		rates: { A: 11000, B: 12900, C: 14900, D: null }
	},
	{
		name: 'Shoulder — Apr (post-Easter)',
		colour: '#ffacac',
		start: '2026-04-07',
		end: '2026-04-30',
		rates: { A: 9900, B: 11000, C: 13900, D: null }
	},
	{
		name: 'Shoulder — May',
		colour: '#e5beff',
		start: '2026-05-01',
		end: '2026-05-14',
		rates: { A: 11000, B: 12900, C: 14900, D: null }
	},
	{
		name: 'Mid — Victoria Day',
		colour: '#adccff',
		start: '2026-05-15',
		end: '2026-05-18',
		rates: { A: 12900, B: 13900, C: 15900, D: null }
	},
	{
		name: 'Shoulder — Late May',
		colour: '#e5beff',
		start: '2026-05-19',
		end: '2026-05-31',
		rates: { A: 11000, B: 12900, C: 14900, D: null }
	},
	{
		name: 'Mid — June',
		colour: '#adccff',
		start: '2026-06-01',
		end: '2026-06-29',
		rates: { A: 12900, B: 13900, C: 15900, D: null }
	},
	{
		name: 'Peak — Canada Day & Summer',
		colour: '#ffff00',
		start: '2026-06-30',
		end: '2026-07-29',
		minNights: 3,
		rates: { A: 18900, B: 19900, C: 21000, D: 25900 }
	},
	{
		name: 'Peak — Civic Holiday',
		colour: '#ea4335',
		start: '2026-07-30',
		end: '2026-08-03',
		minNights: 3,
		rates: { A: 19900, B: 21000, C: 22900, D: 22900 }
	},
	{
		name: 'Peak — Late Summer & Labour Day',
		colour: '#ffff00',
		start: '2026-08-04',
		end: '2026-09-07',
		minNights: 3,
		rates: { A: 18900, B: 19900, C: 21000, D: 25900 }
	},
	{
		name: 'Mid — Fall',
		colour: '#adccff',
		start: '2026-09-08',
		end: '2026-09-20',
		rates: { A: 12900, B: 13900, C: 15900, D: null }
	},
	{
		name: 'Shoulder — Fall, Oct & Nov',
		colour: '#fce5cd',
		start: '2026-09-21',
		end: '2026-11-30',
		rates: { A: 8900, B: 9900, C: 11000, D: null }
	},
	{
		name: 'Low — December',
		colour: '#b7fab7',
		start: '2026-12-01',
		end: '2026-12-31',
		rates: { A: 7900, B: 8900, C: 9900, D: null }
	}
];

// Insert the same season set for both properties
for (const propId of [FALCON, SPANISH]) {
	const propShort = propId === FALCON ? 'falcon' : 'spanish';
	const rtMap =
		propId === FALCON
			? { A: RT.falconA, B: RT.falconB, C: RT.falconC, D: RT.falconD }
			: { A: RT.spanishA, B: RT.spanishB, C: RT.spanishC, D: RT.spanishD };

	for (let i = 0; i < seasons.length; i++) {
		const s = seasons[i];
		const seasonId = `rs-${propShort}-2026-${String(i).padStart(2, '0')}`;

		await db
			.insert(schema.rateSeasons)
			.values({
				id: seasonId,
				propertyId: propId,
				name: s.name,
				colour: s.colour,
				startDate: s.start,
				endDate: s.end,
				minNights: s.minNights ?? 1,
				sortOrder: i
			})
			.onConflictDoNothing();

		const tiers = (['A', 'B', 'C', 'D'] as const)
			.filter((cat) => s.rates[cat] !== null)
			.map((cat) => ({
				id: `rt-tier-${propShort}-2026-${String(i).padStart(2, '0')}-${cat}`,
				seasonId,
				roomTypeId: rtMap[cat],
				nightlyRate: s.rates[cat] as number
			}));

		if (tiers.length > 0) {
			await db.insert(schema.rateTiers).values(tiers).onConflictDoNothing();
		}
	}
}

console.log(`✓ Rate seasons (${seasons.length} × 2 properties) + tiers`);

// ─── Tax Presets ──────────────────────────────────────────────────────────────
// BC accommodation taxes. Rates are approximate — update in Settings.
// GST: 5% federal
// PST: 11% (BC 8% PST + 3% MRDT municipal tourism levy)

for (const propId of [FALCON, SPANISH]) {
	const propShort = propId === FALCON ? 'falcon' : 'spanish';
	await db
		.insert(schema.taxPresets)
		.values([
			{
				id: `tax-${propShort}-gst`,
				propertyId: propId,
				label: 'GST',
				ratePercent: 5.0,
				isActive: true,
				sortOrder: 0
			},
			{
				id: `tax-${propShort}-pst`,
				propertyId: propId,
				label: 'PST',
				ratePercent: 11.0,
				isActive: true,
				sortOrder: 1
			}
		])
		.onConflictDoNothing();
}

console.log('✓ Tax presets');

// ─── Booking Channels ─────────────────────────────────────────────────────────

await db
	.insert(schema.bookingChannels)
	.values([
		{ id: CH.direct, name: 'Direct', isOta: false, isActive: true, sortOrder: 0 },
		{ id: CH.expedia, name: 'Expedia', isOta: true, isActive: true, sortOrder: 1 },
		{ id: CH.bookingCom, name: 'Booking.com', isOta: true, isActive: true, sortOrder: 2 }
	])
	.onConflictDoNothing();

console.log('✓ Booking channels');

// ─── Done ─────────────────────────────────────────────────────────────────────

client.close();

console.log('\nSeed complete.');
console.log(
	'Next steps:\n' +
	'  1. Update property addresses and GST numbers in Settings\n' +
	'  2. Review room type assignments (Settings → Rooms)\n' +
	'  3. Adjust room desirability/cleaning weights as needed\n' +
	'  4. Verify tax rates match current BC rates\n' +
	'  5. Add CC_ENCRYPTION_KEY to .env before taking any phone bookings'
);
