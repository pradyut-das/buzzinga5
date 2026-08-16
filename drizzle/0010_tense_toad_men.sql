CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text,
	`user_email` text,
	`surface` text NOT NULL,
	`operation` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`thought_tokens` integer DEFAULT 0 NOT NULL,
	`cached_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`estimated` integer DEFAULT false NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`blocked_by` text,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_user_created_idx` ON `ai_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_surface_created_idx` ON `ai_usage` (`surface`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage_counters` (
	`subject` text NOT NULL,
	`window` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`cost_micro_usd` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`subject`, `window`, `bucket_start`)
);
--> statement-breakpoint
CREATE INDEX `ai_usage_counters_bucket_idx` ON `ai_usage_counters` (`bucket_start`);