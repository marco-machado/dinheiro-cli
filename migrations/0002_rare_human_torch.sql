CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`match` text NOT NULL,
	`amounts` text,
	`days_of_month` text,
	`account_id` text,
	`category_id` text NOT NULL,
	`priority` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rules_priority_idx` ON `rules` (`priority`);