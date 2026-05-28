/**
 * Adds email_note and email_signature columns to the properties table.
 * email_note: optional paragraph shown near the top of confirmation/pre-arrival emails.
 * email_signature: sign-off text shown at the bottom of every guest email.
 *
 * Run once: node scripts/migrate-email-templates.mjs
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'local.db');
const db = new Database(dbPath);

const cols = db.prepare("PRAGMA table_info(properties)").all().map(c => c.name);

if (!cols.includes('email_note')) {
	db.prepare("ALTER TABLE properties ADD COLUMN email_note TEXT").run();
	console.log('Added email_note column');
} else {
	console.log('email_note already exists');
}

if (!cols.includes('email_signature')) {
	db.prepare("ALTER TABLE properties ADD COLUMN email_signature TEXT").run();
	console.log('Added email_signature column');
} else {
	console.log('email_signature already exists');
}

db.close();
console.log('Migration complete.');
