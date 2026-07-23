/**
 * Adds depositCalcMethod, depositPercent, depositFlatCents columns to the properties table.
 * Run once: npx tsx --env-file=.env scripts/migrate-deposit-calc.ts
 */
import Database from 'better-sqlite3';
import { resolve } from 'path';

const dbPath = process.env.DATABASE_URL?.replace('file:', '') ?? resolve('data/app.db');
const db = new Database(dbPath);

const cols = db.pragma("table_info('properties')") as { name: string }[];
const names = cols.map((c) => c.name);

if (!names.includes('deposit_calc_method')) {
	db.exec(`ALTER TABLE properties ADD COLUMN deposit_calc_method TEXT NOT NULL DEFAULT 'first_night'`);
	console.log('✓ Added deposit_calc_method');
} else {
	console.log('  deposit_calc_method already exists');
}

if (!names.includes('deposit_percent')) {
	db.exec(`ALTER TABLE properties ADD COLUMN deposit_percent INTEGER`);
	console.log('✓ Added deposit_percent');
} else {
	console.log('  deposit_percent already exists');
}

if (!names.includes('deposit_flat_cents')) {
	db.exec(`ALTER TABLE properties ADD COLUMN deposit_flat_cents INTEGER`);
	console.log('✓ Added deposit_flat_cents');
} else {
	console.log('  deposit_flat_cents already exists');
}

db.close();
console.log('Migration complete.');
