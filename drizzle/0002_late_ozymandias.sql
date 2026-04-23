CREATE TABLE `booking_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_ota` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_channels_name_unique` ON `booking_channels` (`name`);--> statement-breakpoint
CREATE TABLE `booking_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`quantity` real,
	`unit_amount` integer,
	`total_amount` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bli_booking_idx` ON `booking_line_items` (`booking_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`room_id` text,
	`guest_id` text,
	`channel_id` text,
	`clerk_id` text,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`check_in_date` text NOT NULL,
	`check_out_date` text NOT NULL,
	`num_adults` integer DEFAULT 1 NOT NULL,
	`num_children` integer DEFAULT 0 NOT NULL,
	`vehicle_make` text,
	`vehicle_colour` text,
	`vehicle_plate` text,
	`ota_confirmation_number` text,
	`notes` text,
	`checked_in_at` integer,
	`checked_out_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`channel_id`) REFERENCES `booking_channels`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`clerk_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bookings_property_idx` ON `bookings` (`property_id`);--> statement-breakpoint
CREATE INDEX `bookings_room_idx` ON `bookings` (`room_id`);--> statement-breakpoint
CREATE INDEX `bookings_checkin_idx` ON `bookings` (`check_in_date`);--> statement-breakpoint
CREATE INDEX `bookings_status_idx` ON `bookings` (`status`);--> statement-breakpoint
CREATE TABLE `cc_staging` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`encrypted_data` text NOT NULL,
	`last_four` text,
	`card_type` text,
	`is_charged` integer DEFAULT false NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cc_staging_booking_id_unique` ON `cc_staging` (`booking_id`);--> statement-breakpoint
CREATE TABLE `guests` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`street` text,
	`city` text,
	`province_state` text,
	`country` text,
	`notes` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`booking_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text NOT NULL,
	`receipt_number` text,
	`notes` text,
	`charged_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pe_booking_idx` ON `payment_events` (`booking_id`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`logo_url` text,
	`address` text NOT NULL,
	`city` text NOT NULL,
	`province` text NOT NULL,
	`postal_code` text,
	`phone` text,
	`website` text,
	`gst_number` text,
	`checkin_time` text DEFAULT '14:00' NOT NULL,
	`checkout_time` text DEFAULT '10:30' NOT NULL,
	`policy_text` text,
	`cancellation_policy` text,
	`early_departure_policy` text,
	`smoking_fee` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`colour` text DEFAULT '#cccccc' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rate_seasons_property_idx` ON `rate_seasons` (`property_id`);--> statement-breakpoint
CREATE TABLE `rate_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`season_id` text NOT NULL,
	`room_type_id` text NOT NULL,
	`nightly_rate` integer NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `rate_seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_tiers_season_type_uq` ON `rate_tiers` (`season_id`,`room_type_id`);--> statement-breakpoint
CREATE TABLE `room_channel_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `booking_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rcl_room_channel_uq` ON `room_channel_listings` (`room_id`,`channel_id`);--> statement-breakpoint
CREATE TABLE `room_types` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`room_type_id` text,
	`room_number` text NOT NULL,
	`num_rooms` integer DEFAULT 1 NOT NULL,
	`has_kitchen` integer DEFAULT false NOT NULL,
	`queen_beds` integer DEFAULT 0 NOT NULL,
	`double_beds` integer DEFAULT 0 NOT NULL,
	`has_hideabed` integer DEFAULT false NOT NULL,
	`desirability_weight` integer DEFAULT 5 NOT NULL,
	`cleaning_ease_weight` integer DEFAULT 5 NOT NULL,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `rooms_property_idx` ON `rooms` (`property_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_property_number_uq` ON `rooms` (`property_id`,`room_number`);--> statement-breakpoint
CREATE TABLE `tax_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`label` text NOT NULL,
	`rate_percent` real NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP TABLE `task`;