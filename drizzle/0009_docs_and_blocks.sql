CREATE TABLE `doc_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`doc_id` text NOT NULL,
	`position` integer NOT NULL,
	`type` text NOT NULL,
	`level` integer,
	`text` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`doc_id`) REFERENCES `docs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `doc_blocks_doc_position_idx` ON `doc_blocks` (`doc_id`,`position`);--> statement-breakpoint
CREATE TABLE `docs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`task_id` text,
	`title` text NOT NULL,
	`content` text,
	`created_by` text,
	`created_at` integer,
	`updated_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `search_blocks` ADD `doc_id` text;