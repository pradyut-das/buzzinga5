CREATE TABLE `email_send_counters` (
	`subject` text NOT NULL,
	`window` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`emails` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`subject`, `window`, `bucket_start`)
);
--> statement-breakpoint
CREATE INDEX `email_send_counters_bucket_idx` ON `email_send_counters` (`bucket_start`);