-- Add payment_events.status for pending/received tracking.
-- Existing rows default to 'received' (they were already considered received).
-- New deposits created via the booking form start as 'pending' until marked received.
ALTER TABLE payment_events ADD COLUMN status TEXT NOT NULL DEFAULT 'received';
