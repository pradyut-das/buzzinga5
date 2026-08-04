-- The General (cross-board) view was removed. Its tables held only derived
-- data (lanes auto-mapped from board columns), so they are dropped outright.
DROP TABLE IF EXISTS `general_column_mappings`;--> statement-breakpoint
DROP TABLE IF EXISTS `general_columns`;
