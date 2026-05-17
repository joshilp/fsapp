import Database from 'better-sqlite3';
const db = new Database('local.db');
try {
  db.exec('ALTER TABLE room_types ADD COLUMN default_rate_cents INTEGER');
  console.log('Migration applied: default_rate_cents column added to room_types');
} catch (e) {
  if (e.message?.includes('duplicate column')) {
    console.log('Column already exists, skipping');
  } else {
    throw e;
  }
}
const cols = db.prepare("PRAGMA table_info(room_types)").all();
console.log('Columns:', cols.map(c => c.name).join(', '));
db.close();
