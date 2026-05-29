const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();
const db = new Database(path.resolve(process.env.DATABASE_URL.replace('file:', '')));

// Check what columns exist and add any that are missing
const checks = [
	{ table: 'rate_tiers',  col: 'dow_rates',          stmt: 'ALTER TABLE rate_tiers ADD COLUMN dow_rates TEXT' },
	{ table: 'room_types',  col: 'max_nights',          stmt: 'ALTER TABLE room_types ADD COLUMN max_nights INTEGER' },
	{ table: 'properties',  col: 'gap_fill_nights',     stmt: 'ALTER TABLE properties ADD COLUMN gap_fill_nights INTEGER NOT NULL DEFAULT 0' },
	{ table: 'properties',  col: 'quarantine_hours',    stmt: 'ALTER TABLE properties ADD COLUMN quarantine_hours INTEGER NOT NULL DEFAULT 0' },
	{ table: 'properties',  col: 'default_max_nights',  stmt: 'ALTER TABLE properties ADD COLUMN default_max_nights INTEGER' },
	{ table: 'rooms',       col: 'quarantine_until',    stmt: 'ALTER TABLE rooms ADD COLUMN quarantine_until INTEGER' },
];

for (const { table, col, stmt } of checks) {
	const cols = db.prepare(`PRAGMA table_info(${table})`).all();
	const exists = cols.some(c => c.name === col);
	if (exists) {
		console.log(`SKIP (exists): ${table}.${col}`);
	} else {
		try {
			db.exec(stmt);
			console.log(`OK: ${table}.${col}`);
		} catch (e) {
			console.error(`ERR: ${e.message} | ${stmt}`);
		}
	}
}

// Also verify night_audit_runs table
try {
	db.exec(`CREATE TABLE IF NOT EXISTS night_audit_runs (
		id TEXT PRIMARY KEY,
		property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
		audit_date TEXT NOT NULL,
		ran_by TEXT REFERENCES user(id) ON DELETE SET NULL,
		notes TEXT,
		created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
		UNIQUE(property_id, audit_date)
	)`);
	console.log('OK: night_audit_runs table');
} catch (e) {
	if (e.message.includes('already exists')) console.log('SKIP: night_audit_runs table');
	else console.error('ERR night_audit_runs:', e.message);
}

db.close();
console.log('done');
