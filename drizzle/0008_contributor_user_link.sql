ALTER TABLE `contributors` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
-- Contributors become a view onto real accounts: people pickers list users and
-- find-or-create the contributor behind the choice. Existing rows are matched
-- by email where one exists, and left null where no account matches.
UPDATE `contributors`
SET `user_id` = (
  SELECT `users`.`id`
  FROM `users`
  WHERE lower(`users`.`email`) = lower(`contributors`.`email`)
)
WHERE `contributors`.`email` IS NOT NULL;
