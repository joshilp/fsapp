/**
 * Adds Channex channel-manager columns and the rate_overrides table.
 * Run once: npx tsx --env-file=.env scripts/migrate-channex.ts
 */
import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') ?? resolve('data/app.db');
const db = new Database(dbPath);

// ── properties: add channex_property_id ──────────────────────────────────────
const propCols = (db.pragma("table_info('properties')") as { name: string }[]).map((c) => c.name);
if (!propCols.includes('channex_property_id')) {
	db.exec(`ALTER TABLE properties ADD COLUMN channex_property_id TEXT`);
	console.log('✓ properties.channex_property_id');
} else {
	console.log('  properties.channex_property_id already exists');
}

// ── room_types: add channex_room_type_id + channex_rate_plan_id ───────────────
const rtCols = (db.pragma("table_info('room_types')") as { name: string }[]).map((c) => c.name);
if (!rtCols.includes('channex_room_type_id')) {
	db.exec(`ALTER TABLE room_types ADD COLUMN channex_room_type_id TEXT`);
	console.log('✓ room_types.channex_room_type_id');
} else {
	console.log('  room_types.channex_room_type_id already exists');
}
if (!rtCols.includes('channex_rate_plan_id')) {
	db.exec(`ALTER TABLE room_types ADD COLUMN channex_rate_plan_id TEXT`);
	console.log('✓ room_types.channex_rate_plan_id');
} else {
	console.log('  room_types.channex_rate_plan_id already exists');
}

// ── rate_overrides table ──────────────────────────────────────────────────────
const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(
	(t) => t.name
);
if (!tables.includes('rate_overrides')) {
	db.exec(`
		CREATE TABLE rate_overrides (
			id TEXT PRIMARY KEY,
			room_type_id TEXT NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
			date TEXT NOT NULL,
			rate_cents INTEGER,
			min_nights INTEGER,
			stop_sell INTEGER NOT NULL DEFAULT 0,
			closed_to_arrival INTEGER NOT NULL DEFAULT 0,
			closed_to_departure INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			UNIQUE(room_type_id, date)
		);
		CREATE INDEX rate_overrides_type_idx ON rate_overrides(room_type_id);
		CREATE INDEX rate_overrides_date_idx ON rate_overrides(date);
	`);
	console.log('✓ rate_overrides table created');
} else {
	console.log('  rate_overrides table already exists');
}

db.close();
console.log('Migration complete.');
