ALTER TABLE `ranking_snapshots` ADD COLUMN `countdown_seconds` integer DEFAULT 180 NOT NULL;

CREATE TABLE `live_session_board_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `fan_id` text NOT NULL,
  `gift_diamonds` integer DEFAULT 0 NOT NULL,
  `ticket_used` integer DEFAULT 0 NOT NULL,
  `ticket_deposit` integer DEFAULT 0 NOT NULL,
  `manual_adjustment` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'normal' NOT NULL,
  `tie_order` integer DEFAULT 0 NOT NULL,
  `note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`),
  FOREIGN KEY (`fan_id`) REFERENCES `fans`(`id`)
);

CREATE UNIQUE INDEX `live_session_board_entries_session_fan_idx`
  ON `live_session_board_entries` (`session_id`, `fan_id`);
CREATE INDEX `live_session_board_entries_session_score_idx`
  ON `live_session_board_entries` (`session_id`, `status`, `gift_diamonds`, `ticket_used`, `ticket_deposit`, `manual_adjustment`);
