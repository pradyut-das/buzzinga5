CREATE TABLE `approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`client_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`due_at` integer,
	`decided_at` integer,
	`decided_by_id` text,
	`decision_note` text,
	`created_at` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`task_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`blob_url` text,
	`thumbnail_url` text,
	`accent` text,
	`content_type` text,
	`size_bytes` integer,
	`slide_count` integer,
	`duration_seconds` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`supersedes_id` text,
	`body` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `board_members` (
	`board_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer,
	PRIMARY KEY(`board_id`, `user_id`),
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `boards` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`title` text DEFAULT 'New board' NOT NULL,
	`password_hash` text,
	`owner_id` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`body` text NOT NULL,
	`audience` text DEFAULT 'all' NOT NULL,
	`scheduled_at` integer,
	`sent_at` integer,
	`state` text DEFAULT 'draft' NOT NULL,
	`scheduled_by` text,
	`error` text,
	`created_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `caption_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`asset_id` text,
	`task_id` text,
	`goal` text,
	`voice` text,
	`variants` text NOT NULL,
	`selected_index` integer,
	`final_body` text,
	`checks` text,
	`attached_at` integer,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`initials` text NOT NULL,
	`color` text DEFAULT '#d8b4fe' NOT NULL,
	`voice_guide` text,
	`banned_phrases` text,
	`next_deadline_at` integer,
	`archived_at` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `columns` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`is_collapsed` integer DEFAULT false,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`board_id` text NOT NULL,
	`author_id` text NOT NULL,
	`stakeholder_id` text,
	`content` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`author_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`stakeholder_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `communities` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`name` text NOT NULL,
	`platform` text DEFAULT 'whatsapp' NOT NULL,
	`external_id` text,
	`member_count` integer DEFAULT 0 NOT NULL,
	`needs_reply` integer DEFAULT 0 NOT NULL,
	`last_broadcast_at` integer,
	`trend_pct` integer DEFAULT 0 NOT NULL,
	`synced_at` integer,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `contributors` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`color` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `integration_syncs` (
	`provider` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'never' NOT NULL,
	`last_sync_at` integer,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `pending_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`task_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`type` text NOT NULL,
	`triggered_by_id` text,
	`metadata` text,
	`created_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`triggered_by_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `review_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`approval_id` text NOT NULL,
	`slide_index` integer,
	`timestamp_seconds` integer,
	`author` text NOT NULL,
	`source` text DEFAULT 'agency' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `scheduled_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`asset_id` text,
	`task_id` text,
	`platform` text DEFAULT 'instagram' NOT NULL,
	`title` text NOT NULL,
	`scheduled_at` integer NOT NULL,
	`state` text DEFAULT 'planned' NOT NULL,
	`published_at` integer,
	`error` text,
	`created_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sent_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`from_email` text DEFAULT 'notifications@resend.dev' NOT NULL,
	`recipient_email` text NOT NULL,
	`recipient_name` text NOT NULL,
	`subject` text NOT NULL,
	`board_id` text NOT NULL,
	`board_title` text NOT NULL,
	`html_content` text NOT NULL,
	`notification_ids` text NOT NULL,
	`sent_to_resend` integer DEFAULT false,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `task_assignees` (
	`task_id` text NOT NULL,
	`contributor_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `contributor_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `task_stakeholders` (
	`task_id` text NOT NULL,
	`contributor_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `contributor_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `task_tags` (
	`task_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `tag_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`column_id` text NOT NULL,
	`title` text NOT NULL,
	`priority` text DEFAULT 'none' NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`column_id`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text,
	`title` text NOT NULL,
	`evidence` text,
	`momentum_pct` integer DEFAULT 0 NOT NULL,
	`novelty` integer DEFAULT 50 NOT NULL,
	`state` text DEFAULT 'watch' NOT NULL,
	`source` text,
	`source_url` text,
	`radar_x` integer,
	`radar_y` integer,
	`brief_task_id` text,
	`captured_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brief_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`comment_id` text NOT NULL,
	`url` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);