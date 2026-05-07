const Database = require('better-sqlite3');
const db = new Database('local.db');
try {
  db.exec("ALTER TABLE payment_events ADD COLUMN status TEXT NOT NULL DEFAULT 'received'");
  console.log('Migration applied: payment_events.status added');
} catch(e) {
  if (e.message.includes('duplicate column')) {
    console.log('Column already exists, skipping');
  } else {
    console.error('Error:', e.message);
    process.exit(1);
  }
}
db.close();
