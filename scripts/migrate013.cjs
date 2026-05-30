// Idempotent migration 0013: add tax_preset_ids + posting_factor to addon_presets
const path = require('path');
const Database = require(path.join(__dirname, '..', 'node_modules', 'better-sqlite3'));
const db = new Database(path.join(__dirname, '..', 'local.db'));

function hasColumn(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(r => r.name === col);
}

if (!hasColumn('addon_presets', 'tax_preset_ids')) {
  db.prepare('ALTER TABLE addon_presets ADD COLUMN tax_preset_ids TEXT').run();
  console.log('Added tax_preset_ids');
} else { console.log('tax_preset_ids already exists'); }

if (!hasColumn('addon_presets', 'posting_factor')) {
  db.prepare("ALTER TABLE addon_presets ADD COLUMN posting_factor TEXT NOT NULL DEFAULT 'per_stay'").run();
  console.log('Added posting_factor');
} else { console.log('posting_factor already exists'); }

console.log('Migration 013 complete.');
db.close();
