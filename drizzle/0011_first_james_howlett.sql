ALTER TABLE `contributors` ADD `unsubscribed_at` integer;--> statement-breakpoint
ALTER TABLE `contributors` ADD `unsubscribe_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `contributors_unsubscribe_token_unique` ON `contributors` (`unsubscribe_token`);