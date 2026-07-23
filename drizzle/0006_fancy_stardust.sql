CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text,
	`name` text NOT NULL,
	`organizer_name` text,
	`organizer_phone` text,
	`organizer_email` text,
	`billing_type` text DEFAULT 'master' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `bookings` ADD `public_token` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `requested_room_type_id` text REFERENCES room_types(id);--> statement-breakpoint
ALTER TABLE `bookings` ADD `checkout_notes` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `moved_from_booking_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `moved_to_booking_id` text;--> statement-breakpoint
ALTER TABLE `bookings` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
ALTER TABLE `bookings` ADD `waiver_signed` integer DEFAULT false;--> statement-breakpoint
ALTER TABLE `guests` ADD `rating` integer;--> statement-breakpoint
ALTER TABLE `guests` ADD `rating_notes` text;