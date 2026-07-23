-- Add online booking fields to properties
ALTER TABLE properties ADD COLUMN public_id TEXT;
ALTER TABLE properties ADD COLUMN booking_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE properties ADD COLUMN booking_description TEXT;
ALTER TABLE properties ADD COLUMN hero_image_url TEXT;
ALTER TABLE properties ADD COLUMN accent_colour TEXT;

-- Backfill public_id for existing properties (8 random hex chars)
UPDATE properties SET public_id = lower(hex(randomblob(4))) WHERE public_id IS NULL;

-- Unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_public_id ON properties(public_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_public_token ON bookings(public_token);
