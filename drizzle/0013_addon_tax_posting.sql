-- Migration 0013: Per-addon tax association + posting factor
ALTER TABLE addon_presets ADD COLUMN tax_preset_ids TEXT;
ALTER TABLE addon_presets ADD COLUMN posting_factor TEXT NOT NULL DEFAULT 'per_stay';
