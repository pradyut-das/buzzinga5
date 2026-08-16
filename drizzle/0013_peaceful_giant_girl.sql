CREATE TABLE `ai_voice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`charged_micro_usd` integer NOT NULL,
	`settled_at` integer
);
--> statement-breakpoint
CREATE INDEX `ai_voice_sessions_user_idx` ON `ai_voice_sessions` (`user_id`);