CREATE TABLE `task_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#d8b4fe' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`board_id`) REFERENCES `boards`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
DROP TABLE `uploaded_files`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `category_id` text REFERENCES task_categories(id);--> statement-breakpoint
INSERT INTO `task_categories` (`id`, `board_id`, `name`, `color`, `position`, `created_at`)
SELECT lower(hex(randomblob(16))), `board_id`, `type`, '#d8b4fe', 0, unixepoch()
FROM `tasks`
WHERE `type` IS NOT NULL
GROUP BY `board_id`, `type`;--> statement-breakpoint
UPDATE `tasks` SET `category_id` = (
	SELECT `c`.`id` FROM `task_categories` `c`
	WHERE `c`.`board_id` = `tasks`.`board_id` AND `c`.`name` = `tasks`.`type`
);--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `type`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `parent_task_id`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `cta_phrase`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `cta_link`;--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `upgraded_from`;
