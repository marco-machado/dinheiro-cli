DROP INDEX `accounts_name_unique`;--> statement-breakpoint
ALTER TABLE `accounts` ADD `name_normalized` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `accounts` SET `name_normalized` = `id`;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_normalized_unique` ON `accounts` (`name_normalized`);--> statement-breakpoint
DROP INDEX `categories_name_unique`;--> statement-breakpoint
ALTER TABLE `categories` ADD `name_normalized` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `categories` SET `name_normalized` = `id`;--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_normalized_unique` ON `categories` (`name_normalized`);