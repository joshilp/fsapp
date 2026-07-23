import Database from 'better-sqlite3';
const db = new Database('local.db');
try {
  db.exec('ALTER TABLE rate_seasons ADD COLUMN base_rate_cents INTEGER');
  console.log('Migration applied: base_rate_cents column added to rate_seasons');
} catch (e) {
  if (e.message?.includes('duplicate column')) {
    console.log('Column already exists, skipping');
  } else {
    throw e;
  }
}
const cols = db.prepare("PRAGMA table_info(rate_seasons)").all();
console.log('Columns:', cols.map(c => c.name).join(', '));
db.close();
