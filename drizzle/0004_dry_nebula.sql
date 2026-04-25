ALTER TABLE `user` ADD `is_approved` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `is_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookings` ADD `room_config` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `king_beds` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rooms` ADD `configs` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `housekeeping_status` text DEFAULT 'clean' NOT NULL;