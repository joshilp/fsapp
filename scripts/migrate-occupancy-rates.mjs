import Database from 'better-sqlite3';
const db = new Database('local.db');

const migrations = [
  {
    sql: 'ALTER TABLE rate_seasons ADD COLUMN is_manual_only INTEGER NOT NULL DEFAULT 0',
    label: 'rate_seasons.is_manual_only'
  },
  {
    sql: 'ALTER TABLE rate_tiers ADD COLUMN base_occupancy INTEGER NOT NULL DEFAULT 2',
    label: 'rate_tiers.base_occupancy'
  },
  {
    sql: 'ALTER TABLE rate_tiers ADD COLUMN extra_guest_fee_cents INTEGER NOT NULL DEFAULT 0',
    label: 'rate_tiers.extra_guest_fee_cents'
  }
];

for (const { sql, label } of migrations) {
  try {
    db.exec(sql);
    console.log(`Applied: ${label}`);
  } catch (e) {
    if (e.message?.includes('duplicate column')) {
      console.log(`Already exists: ${label}`);
    } else {
      throw e;
    }
  }
}

const cols1 = db.prepare('PRAGMA table_info(rate_seasons)').all();
console.log('rate_seasons columns:', cols1.map(c => c.name).join(', '));
const cols2 = db.prepare('PRAGMA table_info(rate_tiers)').all();
console.log('rate_tiers columns:', cols2.map(c => c.name).join(', '));
db.close();
