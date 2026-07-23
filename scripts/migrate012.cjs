const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();
const db = new Database(path.resolve(process.env.DATABASE_URL.replace('file:', '')));

const stmts = [
	'ALTER TABLE room_types ADD COLUMN max_nights INTEGER',
	`CREATE TABLE IF NOT EXISTS night_audit_runs (
		id TEXT PRIMARY KEY,
		property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
		audit_date TEXT NOT NULL,
		ran_by TEXT REFERENCES user(id) ON DELETE SET NULL,
		notes TEXT,
		created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
		UNIQUE(property_id, audit_date)
	)`,
	'CREATE INDEX IF NOT EXISTS nar_property_idx ON night_audit_runs(property_id)'
];

for (const s of stmts) {
	try {
		db.exec(s);
		console.log('OK:', s.slice(0, 70).replace(/\s+/g, ' '));
	} catch (e) {
		if (e.message.includes('duplicate column') || e.message.includes('already exists')) {
			console.log('SKIP:', s.slice(0, 70).replace(/\s+/g, ' '));
		} else {
			console.error('ERR:', e.message, '|', s.slice(0, 80).replace(/\s+/g, ' '));
		}
	}
}
db.close();
console.log('done');
