-- Migration 0012: weekday pricing, max stay, gap restrictions, quarantine, night audit
-- Applied manually via scripts/migrate012-fix.cjs (idempotent column checks)

-- rate_tiers: day-of-week rate overrides
ALTER TABLE rate_tiers ADD COLUMN dow_rates TEXT;

-- room_types: max stay restriction (null = use property default)
ALTER TABLE room_types ADD COLUMN max_nights INTEGER;

-- properties: gap fill nights (0 = off), quarantine hours (0 = off), default max nights
ALTER TABLE properties ADD COLUMN gap_fill_nights INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN quarantine_hours INTEGER NOT NULL DEFAULT 0;
ALTER TABLE properties ADD COLUMN default_max_nights INTEGER;

-- rooms: quarantine timestamp (ms); null or past = not quarantined
ALTER TABLE rooms ADD COLUMN quarantine_until INTEGER;

-- night_audit_runs: one record per property per night
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
