ALTER TABLE `properties` ADD `deposit_calc_method` text DEFAULT 'first_night' NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `deposit_percent` integer;--> statement-breakpoint
ALTER TABLE `properties` ADD `deposit_flat_cents` integer;