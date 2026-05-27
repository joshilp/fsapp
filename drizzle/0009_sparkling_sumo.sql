CREATE TABLE `addon_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`default_unit_cents` integer,
	`is_taxable` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `los_discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`room_type_id` text,
	`label` text NOT NULL,
	`min_nights` integer NOT NULL,
	`discount_percent` real NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `promo_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`discount_percent` real,
	`discount_cents` integer,
	`max_uses` integer,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `promo_codes_property_code_uq` ON `promo_codes` (`property_id`,`code`);--> statement-breakpoint
CREATE TABLE `rate_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`room_type_id` text NOT NULL,
	`date` text NOT NULL,
	`rate_cents` integer,
	`min_nights` integer,
	`availability_override` integer,
	`stop_sell` integer DEFAULT false NOT NULL,
	`closed_to_arrival` integer DEFAULT false NOT NULL,
	`closed_to_departure` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rate_overrides_type_idx` ON `rate_overrides` (`room_type_id`);--> statement-breakpoint
CREATE INDEX `rate_overrides_date_idx` ON `rate_overrides` (`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `rate_overrides_type_date_uq` ON `rate_overrides` (`room_type_id`,`date`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`room_id` text,
	`guest_id` text,
	`channel_id` text,
	`clerk_id` text,
	`status` text DEFAULT 'reserved' NOT NULL,
	`check_in_date` text NOT NULL,
	`check_out_date` text NOT NULL,
	`num_adults` integer DEFAULT 1 NOT NULL,
	`num_children` integer DEFAULT 0 NOT NULL,
	`vehicle_make` text,
	`vehicle_colour` text,
	`vehicle_plate` text,
	`ota_confirmation_number` text,
	`public_token` text,
	`requested_room_type_id` text,
	`clerk_name` text,
	`room_config` text,
	`notes` text,
	`checked_in_at` integer,
	`checked_out_at` integer,
	`cancelled_at` integer,
	`checkout_notes` text,
	`moved_from_booking_id` text,
	`moved_to_booking_id` text,
	`group_id` text,
	`waiver_signed` integer DEFAULT false,
	`self_checkin_token` text,
	`self_checkin_at` integer,
	`pre_arrival_sent_at` integer,
	`confirmation_sent_at` integer,
	`promo_code_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`channel_id`) REFERENCES `booking_channels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`clerk_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`requested_room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_bookings`("id", "property_id", "room_id", "guest_id", "channel_id", "clerk_id", "status", "check_in_date", "check_out_date", "num_adults", "num_children", "vehicle_make", "vehicle_colour", "vehicle_plate", "ota_confirmation_number", "public_token", "requested_room_type_id", "clerk_name", "room_config", "notes", "checked_in_at", "checked_out_at", "cancelled_at", "checkout_notes", "moved_from_booking_id", "moved_to_booking_id", "group_id", "waiver_signed", "self_checkin_token", "self_checkin_at", "pre_arrival_sent_at", "confirmation_sent_at", "promo_code_id", "created_at", "updated_at") SELECT "id", "property_id", "room_id", "guest_id", "channel_id", "clerk_id", "status", "check_in_date", "check_out_date", "num_adults", "num_children", "vehicle_make", "vehicle_colour", "vehicle_plate", "ota_confirmation_number", "public_token", "requested_room_type_id", "clerk_name", "room_config", "notes", "checked_in_at", "checked_out_at", "cancelled_at", "checkout_notes", "moved_from_booking_id", "moved_to_booking_id", "group_id", "waiver_signed", "self_checkin_token", "self_checkin_at", "pre_arrival_sent_at", "confirmation_sent_at", "promo_code_id", "created_at", "updated_at" FROM `bookings`;--> statement-breakpoint
DROP TABLE `bookings`;--> statement-breakpoint
ALTER TABLE `__new_bookings` RENAME TO `bookings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_public_token_unique` ON `bookings` (`public_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_self_checkin_token_unique` ON `bookings` (`self_checkin_token`);--> statement-breakpoint
CREATE INDEX `bookings_property_idx` ON `bookings` (`property_id`);--> statement-breakpoint
CREATE INDEX `bookings_room_idx` ON `bookings` (`room_id`);--> statement-breakpoint
CREATE INDEX `bookings_checkin_idx` ON `bookings` (`check_in_date`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
ALTER TABLE `payment_events` ADD `status` text DEFAULT 'received' NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `channex_property_id` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `elavon_merchant_id` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `elavon_user_id` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `elavon_pin` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `public_id` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `booking_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `booking_description` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `hero_image_url` text;--> statement-breakpoint
ALTER TABLE `properties` ADD `accent_colour` text;--> statement-breakpoint
CREATE UNIQUE INDEX `properties_public_id_unique` ON `properties` (`public_id`);--> statement-breakpoint
ALTER TABLE `rate_seasons` ADD `base_rate_cents` integer;--> statement-breakpoint
ALTER TABLE `room_types` ADD `description` text;--> statement-breakpoint
ALTER TABLE `room_types` ADD `image_url` text;--> statement-breakpoint
ALTER TABLE `room_types` ADD `max_occupancy` integer;--> statement-breakpoint
ALTER TABLE `room_types` ADD `channex_room_type_id` text;--> statement-breakpoint
ALTER TABLE `room_types` ADD `channex_rate_plan_id` text;--> statement-breakpoint
ALTER TABLE `room_types` ADD `default_rate_cents` integer;--> statement-breakpoint
ALTER TABLE `rooms` ADD `door_code` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `checkin_instructions` text;--> statement-breakpoint
ALTER TABLE `tax_presets` ADD `applies_to_room` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `tax_presets` ADD `applies_to_addon` integer DEFAULT true NOT NULL;