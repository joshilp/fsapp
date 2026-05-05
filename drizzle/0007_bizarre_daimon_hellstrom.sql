ALTER TABLE `properties` ADD `deposit_nights` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `cancellation_fee_cents` integer DEFAULT 2500 NOT NULL;--> statement-breakpoint
ALTER TABLE `properties` ADD `no_refund_days` integer DEFAULT 30 NOT NULL;