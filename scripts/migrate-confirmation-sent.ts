/**
 * Adds confirmation_sent_at column to the bookings table.
 * Run once: npx tsx --env-file=.env scripts/migrate-confirmation-sent.ts
 */
import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') ?? resolve('data/app.db');
const db = new Database(dbPath);

const cols = db.pragma("table_info('bookings')") as { name: string }[];
const names = cols.map((c) => c.name);

if (!names.includes('confirmation_sent_at')) {
	db.exec(`ALTER TABLE bookings ADD COLUMN confirmation_sent_at INTEGER`);
	console.log('✓ Added confirmation_sent_at');
} else {
	console.log('  confirmation_sent_at already exists');
}

db.close();
console.log('Migration complete.');
