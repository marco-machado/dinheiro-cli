ALTER TABLE `transactions` ADD `reversal_of` text;--> statement-breakpoint
CREATE INDEX `tx_reversal_of_idx` ON `transactions` (`reversal_of`);