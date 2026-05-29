-- Migration 0012: weekday pricing, max stay, gap restrictions, quarantine, night audit
-- Applied manually: sqlite3 <db-file> < drizzle/0012_weekday_max_gap_quarantine.sql

-- ── rate_tiers: day-of-week rate overrides ───────────────────────────────────
-- JSON 7-element array indexed 0=Sun…6=Sat. null element = use nightlyRate.
-- Example: '[null,null,null,null,null,18900,18900]' = Fri+Sat at $189, all other days use base.
ALTER TABLE rate_tiers ADD COLUMN dow_rates TEXT;

-- ── room_types: max stay restriction ────────────────────────────────────────
-- null = use property-level default_max_nights; set to override per room type.
ALTER TABLE room_types ADD COLUMN max_nights INTEGER;

-- ── properties: gap fill, quarantine, default max stay ───────────────────────
-- gap_fill_nights: block dates that form a gap < N nights between bookings (0 = off)
ALTER TABLE properties ADD COLUMN gap_fill_nights INTEGER NOT NULL DEFAULT 0;
-- quarantine_hours: auto-block room this many hours after checkout (0 = off)
ALTER TABLE properties ADD COLUMN quarantine_hours INTEGER NOT NULL DEFAULT 0;
-- default_max_nights: property-wide max stay (null = no limit, industry default = 21)
ALTER TABLE properties ADD COLUMN default_max_nights INTEGER;

-- ── rooms: quarantine timestamp ──────────────────────────────────────────────
-- Timestamp (ms) until which the room is quarantined after checkout.
-- Null or past timestamp = not quarantined.
ALTER TABLE rooms ADD COLUMN quarantine_until INTEGER;

-- ── night_audit_runs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS night_audit_runs (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  audit_date TEXT NOT NULL,
  ran_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  UNIQUE(property_id, audit_date)
);

CREATE INDEX IF NOT EXISTS nar_property_idx ON night_audit_runs(property_id);
