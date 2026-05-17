-- Add selling availability override to rate_overrides
-- null = use computed availability (totalRooms - bookings)
-- integer = cap on rooms offered online for this date (OTA allotment)
ALTER TABLE rate_overrides ADD COLUMN availability_override INTEGER;
