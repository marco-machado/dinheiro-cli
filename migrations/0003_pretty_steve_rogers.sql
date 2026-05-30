ALTER TABLE `transactions` ADD `merchant` text;--> statement-breakpoint
CREATE INDEX `tx_merchant_idx` ON `transactions` (`merchant`);