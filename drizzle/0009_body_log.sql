CREATE TABLE `body_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`weight_kg` real,
	`body_fat_pct` real,
	`waist_cm` real,
	`hips_cm` real,
	`chest_cm` real,
	`arm_cm` real,
	`thigh_cm` real,
	`neck_cm` real,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_log_user_date_idx` ON `body_log` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `nutrition_targets` ADD `goal_weight_kg` real;