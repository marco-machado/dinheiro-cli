CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`close_day` integer,
	`due_day` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_unique` ON `accounts` (`name`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`format` text NOT NULL,
	`filename` text NOT NULL,
	`row_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text NOT NULL,
	`occurred_at` text NOT NULL,
	`category_id` text,
	`statement_period` text,
	`transfer_id` text,
	`import_batch_id` text,
	`row_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_row_hash_unique` ON `transactions` (`row_hash`);--> statement-breakpoint
CREATE INDEX `tx_account_id_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `tx_occurred_at_idx` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `tx_category_id_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `tx_statement_period_idx` ON `transactions` (`statement_period`);--> statement-breakpoint
CREATE INDEX `tx_transfer_id_idx` ON `transactions` (`transfer_id`);--> statement-breakpoint
CREATE INDEX `tx_import_batch_id_idx` ON `transactions` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `tx_account_occurred_idx` ON `transactions` (`account_id`,`occurred_at`);