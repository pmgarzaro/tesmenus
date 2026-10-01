-- Hand-written: adds households and scopes data to them.
-- Existing data (from before accounts existed) goes to household 1.
-- Runs with foreign keys disabled (see src/db/index.ts) so rebuilding
-- parent tables does not cascade-delete their children.
CREATE TABLE `households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invites` (
	`token` text PRIMARY KEY NOT NULL,
	`household_id` integer,
	`created_by` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`used_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
INSERT INTO `households` (`id`, `name`)
SELECT 1, 'Mon foyer'
WHERE EXISTS (SELECT 1 FROM `recipes`) OR EXISTS (SELECT 1 FROM `ingredients`)
   OR EXISTS (SELECT 1 FROM `meal_plans`) OR EXISTS (SELECT 1 FROM `batch_sessions`)
   OR EXISTS (SELECT 1 FROM `settings`);
--> statement-breakpoint
CREATE TABLE `__new_recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`servings` integer DEFAULT 4 NOT NULL,
	`prep_minutes` integer,
	`cook_minutes` integer,
	`meal_type` text DEFAULT 'plat' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`source_type` text DEFAULT 'manuel' NOT NULL,
	`source_url` text,
	`image_paths` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`fridge_days` integer,
	`freezable` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_recipes` (household_id, id, title, description, servings, prep_minutes, cook_minutes, meal_type, tags, source_type, source_url, image_paths, notes, fridge_days, freezable, created_at, updated_at) SELECT 1, id, title, description, servings, prep_minutes, cook_minutes, meal_type, tags, source_type, source_url, image_paths, notes, fridge_days, freezable, created_at, updated_at FROM `recipes`;
--> statement-breakpoint
DROP TABLE `recipes`;
--> statement-breakpoint
ALTER TABLE `__new_recipes` RENAME TO `recipes`;
--> statement-breakpoint
CREATE TABLE `__new_ingredients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`aisle` text DEFAULT 'autre' NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ingredients` (household_id, id, name, aisle) SELECT 1, id, name, aisle FROM `ingredients`;
--> statement-breakpoint
DROP TABLE `ingredients`;
--> statement-breakpoint
ALTER TABLE `__new_ingredients` RENAME TO `ingredients`;
--> statement-breakpoint
CREATE TABLE `__new_meal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`days` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_meal_plans` (household_id, id, start_date, days, created_at) SELECT 1, id, start_date, days, created_at FROM `meal_plans`;
--> statement-breakpoint
DROP TABLE `meal_plans`;
--> statement-breakpoint
ALTER TABLE `__new_meal_plans` RENAME TO `meal_plans`;
--> statement-breakpoint
CREATE TABLE `__new_batch_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`plan_id` integer,
	`selection` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_batch_sessions` (household_id, id, plan_id, selection, content, created_at) SELECT 1, id, plan_id, selection, content, created_at FROM `batch_sessions`;
--> statement-breakpoint
DROP TABLE `batch_sessions`;
--> statement-breakpoint
ALTER TABLE `__new_batch_sessions` RENAME TO `batch_sessions`;
--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`household_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`household_id`, `key`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_settings` (household_id, key, value) SELECT 1, key, value FROM `settings`;
--> statement-breakpoint
DROP TABLE `settings`;
--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;
--> statement-breakpoint
CREATE UNIQUE INDEX `ingredients_household_name_idx` ON `ingredients` (`household_id`,`name`);
