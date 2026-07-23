/**
 * seed-falcon-rates-2026.mjs
 *
 * Seeds 2026 rate seasons for Falcon Motel and Spanish Fiesta Motel,
 * decoded from the operators' printed rate calendar (Rates.html).
 *
 * Room types updated:
 *   A (1 Bed Sleeping)       → default $79/night
 *   B (2 Bed Sleeping)       → default $89/night
 *   C (2 Bed + Kitchen)      → default $99/night
 *   D (3 Bed + Kitchen)      → no default (only priced in Peak Summer)
 *
 * Season model uses "most specific wins" (shorter date range beats longer).
 * A full-year "Standard" season acts as the floor; specific seasons override it.
 *
 * Run:  node scripts/seed-falcon-rates-2026.mjs
 * Safe: idempotent — skips any season whose name already exists for that property.
 *
 * Add --clear flag to wipe existing 2026 seasons first:
 *   node scripts/seed-falcon-rates-2026.mjs --clear
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const CLEAR = process.argv.includes('--clear');
const db = new Database('local.db');

// ─── Properties ─────────────────────────────────────────────────────────────
const PROPERTY_IDS = ['prop-falcon', 'prop-spanish'];

// ─── Room type categories → per-property IDs ────────────────────────────────
// Original IDs used the letter (rt-falcon-A). Map old letter → new short code.
const CATEGORY_LETTER = { '1BD': 'A', '2BD': 'B', '2BDK': 'C', '3BDK': 'D' };
function getRoomTypeId(propertyId, shortCode) {
  const prefix = propertyId === 'prop-falcon' ? 'rt-falcon' : 'rt-spanish';
  const letter = CATEGORY_LETTER[shortCode];
  return `${prefix}-${letter}`;
}

// ─── Room type name + default rate updates ───────────────────────────────────
const ROOM_TYPE_UPDATES = [
  { category: '1BD',  name: '1 Bed Sleeping',  defaultRateCents: 7900 },
  { category: '2BD',  name: '2 Bed Sleeping',  defaultRateCents: 8900 },
  { category: '2BDK', name: '2 Bed + Kitchen', defaultRateCents: 9900 },
  { category: '3BDK', name: '3 Bed + Kitchen', defaultRateCents: null },
];

// ─── 2026 Season definitions ─────────────────────────────────────────────────
// Rates keyed by short code. null = no tier for that room type.
const SEASONS_2026 = [
  {
    name: 'Standard',
    startDate: '2026-01-01', endDate: '2026-12-31',
    colour: '#b7fab7', minNights: 1, sortOrder: 0,
    baseRateCents: 7900,
    rates: { '1BD': 7900, '2BD': 8900, '2BDK': 9900, '3BDK': null },
  },
  {
    name: 'Spring',
    startDate: '2026-04-01', endDate: '2026-04-30',
    colour: '#ffacac', minNights: 1, sortOrder: 10,
    baseRateCents: 9900,
    rates: { '1BD': 9900, '2BD': 11000, '2BDK': 13900, '3BDK': null },
  },
  {
    name: 'Easter Long Weekend',
    startDate: '2026-04-02', endDate: '2026-04-06',
    colour: '#e5beff', minNights: 3, sortOrder: 20,
    baseRateCents: 11000,
    rates: { '1BD': 11000, '2BD': 12900, '2BDK': 14900, '3BDK': null },
  },
  {
    name: 'Shoulder Season',
    startDate: '2026-05-01', endDate: '2026-05-31',
    colour: '#e5beff', minNights: 1, sortOrder: 30,
    baseRateCents: 11000,
    rates: { '1BD': 11000, '2BD': 12900, '2BDK': 14900, '3BDK': null },
  },
  {
    name: 'Victoria Day',
    startDate: '2026-05-15', endDate: '2026-05-18',
    colour: '#adccff', minNights: 3, sortOrder: 40,
    baseRateCents: 12900,
    rates: { '1BD': 12900, '2BD': 13900, '2BDK': 15900, '3BDK': null },
  },
  {
    name: 'Early Summer',
    startDate: '2026-06-01', endDate: '2026-06-29',
    colour: '#adccff', minNights: 1, sortOrder: 50,
    baseRateCents: 12900,
    rates: { '1BD': 12900, '2BD': 13900, '2BDK': 15900, '3BDK': null },
  },
  {
    name: 'Peak Summer',
    startDate: '2026-06-30', endDate: '2026-09-07',
    colour: '#ffff00', minNights: 1, sortOrder: 60,
    baseRateCents: 18900,
    rates: { '1BD': 18900, '2BD': 19900, '2BDK': 21000, '3BDK': 25900 },
  },
  {
    name: 'Canada Day',
    startDate: '2026-06-30', endDate: '2026-07-05',
    colour: '#ffff00', minNights: 3, sortOrder: 70,
    baseRateCents: 18900,
    rates: { '1BD': 18900, '2BD': 19900, '2BDK': 21000, '3BDK': 25900 },
  },
  {
    name: 'BC Day / Civic Holiday',
    startDate: '2026-07-30', endDate: '2026-08-03',
    colour: '#ea4335', minNights: 3, sortOrder: 80,
    baseRateCents: 19900,
    rates: { '1BD': 19900, '2BD': 21000, '2BDK': 22900, '3BDK': null },
  },
  {
    name: 'Labour Day',
    startDate: '2026-09-03', endDate: '2026-09-07',
    colour: '#ffff00', minNights: 3, sortOrder: 90,
    baseRateCents: 18900,
    rates: { '1BD': 18900, '2BD': 19900, '2BDK': 21000, '3BDK': 25900 },
  },
  {
    name: 'Late Summer',
    startDate: '2026-09-08', endDate: '2026-09-20',
    colour: '#adccff', minNights: 1, sortOrder: 100,
    baseRateCents: 12900,
    rates: { '1BD': 12900, '2BD': 13900, '2BDK': 15900, '3BDK': null },
  },
  {
    name: 'Fall',
    startDate: '2026-09-21', endDate: '2026-11-30',
    colour: '#fce5cd', minNights: 1, sortOrder: 110,
    baseRateCents: 8900,
    rates: { '1BD': 8900, '2BD': 9900, '2BDK': 11000, '3BDK': null },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const stmtCheckSeason = db.prepare(
  `SELECT id FROM rate_seasons WHERE property_id = ? AND name = ? AND start_date = ? AND end_date = ?`
);
const stmtInsertSeason = db.prepare(`
  INSERT INTO rate_seasons (id, property_id, name, start_date, end_date, colour, min_nights, sort_order, base_rate_cents)
  VALUES (@id, @propertyId, @name, @startDate, @endDate, @colour, @minNights, @sortOrder, @baseRateCents)
`);
const stmtInsertTier = db.prepare(`
  INSERT INTO rate_tiers (id, season_id, room_type_id, nightly_rate)
  VALUES (@id, @seasonId, @roomTypeId, @nightlyRate)
  ON CONFLICT(season_id, room_type_id) DO UPDATE SET nightly_rate = excluded.nightly_rate
`);
const stmtDeleteSeasons = db.prepare(`
  DELETE FROM rate_seasons
  WHERE property_id = ? AND start_date >= '2026-01-01' AND end_date <= '2026-12-31'
`);
const stmtUpdateRoomType = db.prepare(`
  UPDATE room_types SET name = @name, category = @category, default_rate_cents = @defaultRateCents WHERE id = @id
`);

// ─── Run ─────────────────────────────────────────────────────────────────────
db.transaction(() => {
  // 1. Update room type names + defaults for both properties
  for (const propId of PROPERTY_IDS) {
    for (const rt of ROOM_TYPE_UPDATES) {
      const id = getRoomTypeId(propId, rt.category);
      stmtUpdateRoomType.run({ id, name: rt.name, category: rt.category, defaultRateCents: rt.defaultRateCents ?? null });
    }
    console.log(`✓ Room types updated for ${propId}`);
  }

  // 2. Optionally clear existing 2026 seasons
  if (CLEAR) {
    for (const propId of PROPERTY_IDS) {
      const { changes } = stmtDeleteSeasons.run(propId);
      console.log(`✓ Cleared ${changes} existing 2026 seasons for ${propId}`);
    }
  }

  // 3. Insert seasons + tiers for each property
  for (const propId of PROPERTY_IDS) {
    let inserted = 0;
    let skipped = 0;

    for (const s of SEASONS_2026) {
      // Idempotency check
      const existing = stmtCheckSeason.get(propId, s.name, s.startDate, s.endDate);
      if (existing) {
        skipped++;
        continue;
      }

      const seasonId = randomUUID();
      stmtInsertSeason.run({
        id: seasonId,
        propertyId: propId,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        colour: s.colour,
        minNights: s.minNights,
        sortOrder: s.sortOrder,
        baseRateCents: s.baseRateCents ?? null,
      });

      // Insert rate tiers for each room type that has a rate
      for (const [category, rateCents] of Object.entries(s.rates)) {
        if (rateCents === null) continue;
        const roomTypeId = getRoomTypeId(propId, category);
        stmtInsertTier.run({
          id: randomUUID(),
          seasonId,
          roomTypeId,
          nightlyRate: rateCents,
        });
      }

      inserted++;
    }

    console.log(`✓ ${propId}: inserted ${inserted} seasons, skipped ${skipped} (already exist)`);
  }
})();

db.close();
console.log('\nDone. Open /rates to verify.');
