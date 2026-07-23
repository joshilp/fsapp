import Database from 'better-sqlite3';
const db = new Database('local.db');
try {
  db.exec('ALTER TABLE rate_overrides ADD COLUMN availability_override INTEGER');
  console.log('Migration applied: availability_override column added');
} catch (e) {
  if (e.message?.includes('duplicate column')) {
    console.log('Column already exists, skipping');
  } else {
    throw e;
  }
}
const cols = db.prepare("PRAGMA table_info(rate_overrides)").all();
console.log('Columns:', cols.map(c => c.name).join(', '));
db.close();
