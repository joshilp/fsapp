/**
 * Adds group_id and waiver_signed columns to the bookings table.
 * Run once: npx tsx --env-file=.env scripts/migrate-booking-card.ts
 */
import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') ?? resolve('data/app.db');
const db = new Database(dbPath);

const cols = db.pragma("table_info('bookings')") as { name: string }[];
const names = cols.map((c) => c.name);

if (!names.includes('group_id')) {
	db.exec(`ALTER TABLE bookings ADD COLUMN group_id TEXT`);
	console.log('✓ Added group_id');
} else {
	console.log('  group_id already exists');
}

if (!names.includes('waiver_signed')) {
	db.exec(`ALTER TABLE bookings ADD COLUMN waiver_signed INTEGER DEFAULT 0`);
	console.log('✓ Added waiver_signed');
} else {
	console.log('  waiver_signed already exists');
}

db.close();
console.log('Migration complete.');
