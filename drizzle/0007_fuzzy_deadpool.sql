CREATE TABLE `search_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`block_id` text,
	`block_index` integer,
	`board_id` text,
	`client_id` text,
	`task_id` text,
	`source_title` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`indexed_at` integer
);
