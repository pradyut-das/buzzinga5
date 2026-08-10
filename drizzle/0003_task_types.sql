CREATE TABLE `task_collaborators` (
	`task_id` text NOT NULL,
	`contributor_id` text NOT NULL,
	PRIMARY KEY(`task_id`, `contributor_id`),
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`contributor_id`) REFERENCES `contributors`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_review_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`approval_id` text,
	`asset_id` text,
	`annotation` text,
	`resolved_at` integer,
	`slide_index` integer,
	`timestamp_seconds` integer,
	`author` text NOT NULL,
	`source` text DEFAULT 'agency' NOT NULL,
	`body` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`approval_id`) REFERENCES `approvals`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_review_notes`("id", "approval_id", "asset_id", "annotation", "resolved_at", "slide_index", "timestamp_seconds", "author", "source", "body", "created_at") SELECT "id", "approval_id", NULL, NULL, NULL, "slide_index", "timestamp_seconds", "author", "source", "body", "created_at" FROM `review_notes`;--> statement-breakpoint
DROP TABLE `review_notes`;--> statement-breakpoint
ALTER TABLE `__new_review_notes` RENAME TO `review_notes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `assets` ADD `state` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `assets` ADD `transcript` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `suggested_title` text;--> statement-breakpoint
ALTER TABLE `assets` ADD `original_name` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `type` text DEFAULT 'idea' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `status` text DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `client_id` text REFERENCES clients(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `parent_task_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `doc` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `cta_phrase` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `cta_link` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `upgraded_from` text;--> statement-breakpoint
-- Backfill: a task inherits its board's client, and its status is read off the
-- column it already sits in, so no board looks reset after the migration.
UPDATE `tasks` SET `client_id` = (SELECT `client_id` FROM `boards` WHERE `boards`.`id` = `tasks`.`board_id`) WHERE `client_id` IS NULL;--> statement-breakpoint
UPDATE `tasks` SET `status` = (
  SELECT CASE
    WHEN lower(`columns`.`name`) LIKE '%done%' OR lower(`columns`.`name`) LIKE '%archive%' THEN 'done'
    WHEN lower(`columns`.`name`) LIKE '%review%' THEN 'review'
    WHEN lower(`columns`.`name`) LIKE '%reject%' THEN 'rejected'
    WHEN lower(`columns`.`name`) LIKE '%accept%' OR lower(`columns`.`name`) LIKE '%approv%' THEN 'accepted'
    WHEN lower(`columns`.`name`) LIKE '%production%' OR lower(`columns`.`name`) LIKE '%progress%' OR lower(`columns`.`name`) LIKE '%doing%' THEN 'in_production'
    ELSE 'todo'
  END FROM `columns` WHERE `columns`.`id` = `tasks`.`column_id`
);--> statement-breakpoint
-- A task that already produced a carousel or a video is that type of task.
UPDATE `tasks` SET `type` = (
  SELECT CASE `assets`.`kind` WHEN 'carousel' THEN 'carousel' WHEN 'video' THEN 'video' ELSE 'other' END
  FROM `assets` WHERE `assets`.`task_id` = `tasks`.`id` LIMIT 1
) WHERE EXISTS (SELECT 1 FROM `assets` WHERE `assets`.`task_id` = `tasks`.`id`);
