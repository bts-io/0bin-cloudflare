DROP TABLE `meta`;--> statement-breakpoint
CREATE TABLE `pastes` (
	`id` text PRIMARY KEY NOT NULL CHECK (length(`id`) = 12),
	`ciphertext` text NOT NULL,
	`size` integer NOT NULL,
	`kind` text NOT NULL CHECK (`kind` IN ('text', 'file')),
	`burn` integer DEFAULT 0 NOT NULL CHECK (`burn` IN (0, 1)),
	`read_token_hash` text NOT NULL,
	`owner_token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
CREATE INDEX `pastes_expires_at_idx` ON `pastes` (`expires_at`) WHERE "pastes"."expires_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `pastes_created_at_idx` ON `pastes` (`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `counters` (
	`name` text PRIMARY KEY NOT NULL,
	`value` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `counters` (`name`, `value`) VALUES ('pastes_created', 0);
