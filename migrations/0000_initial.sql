CREATE TABLE `streamers` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `douyin_name` text,
  `note` text,
  `status` text DEFAULT 'active' NOT NULL,
  `default_rule_template_id` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `role` text NOT NULL,
  `streamer_id` text,
  `username` text NOT NULL,
  `password_hash` text NOT NULL,
  `display_name` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `active_session_id` text,
  `last_login_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`)
);

CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);

CREATE TABLE `fans` (
  `id` text PRIMARY KEY NOT NULL,
  `streamer_id` text NOT NULL,
  `display_name` text NOT NULL,
  `douyin_name` text,
  `wechat_name` text,
  `game_name` text,
  `fan_group_level` text,
  `statuses_json` text DEFAULT '[]' NOT NULL,
  `is_public_in_balance_board` integer DEFAULT 0 NOT NULL,
  `public_name` text,
  `cached_ticket_balance` integer DEFAULT 0 NOT NULL,
  `note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`)
);

CREATE INDEX `fans_streamer_idx` ON `fans` (`streamer_id`);
CREATE INDEX `fans_streamer_display_name_idx` ON `fans` (`streamer_id`, `display_name`);
CREATE INDEX `fans_streamer_douyin_name_idx` ON `fans` (`streamer_id`, `douyin_name`);
CREATE INDEX `fans_public_balance_idx` ON `fans` (`streamer_id`, `is_public_in_balance_board`);

CREATE TABLE `seasons` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `game_version` text,
  `started_at` text,
  `ended_at` text,
  `note` text
);

CREATE TABLE `cards` (
  `id` text PRIMARY KEY NOT NULL,
  `streamer_id` text,
  `season_id` text,
  `name` text NOT NULL,
  `alias` text,
  `category` text,
  `tags_json` text DEFAULT '[]' NOT NULL,
  `note` text,
  `is_enabled` integer DEFAULT 1 NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`),
  FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`)
);

CREATE INDEX `cards_streamer_season_idx` ON `cards` (`streamer_id`, `season_id`);
CREATE INDEX `cards_streamer_enabled_idx` ON `cards` (`streamer_id`, `is_enabled`);

CREATE TABLE `rule_templates` (
  `id` text PRIMARY KEY NOT NULL,
  `streamer_id` text NOT NULL,
  `name` text NOT NULL,
  `mode` text NOT NULL,
  `old_fan_slots` integer DEFAULT 5 NOT NULL,
  `new_fan_slots` integer DEFAULT 2 NOT NULL,
  `requires_eight_players` integer DEFAULT 1 NOT NULL,
  `allow_casual_mode` integer DEFAULT 1 NOT NULL,
  `note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`)
);

CREATE INDEX `rule_templates_streamer_idx` ON `rule_templates` (`streamer_id`);

CREATE TABLE `live_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `streamer_id` text NOT NULL,
  `title` text NOT NULL,
  `session_type` text NOT NULL,
  `rule_template_id` text,
  `status` text DEFAULT 'preparing' NOT NULL,
  `started_at` text,
  `ended_at` text,
  `settled_at` text,
  `settlement_confirmed_by` text,
  `note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`),
  FOREIGN KEY (`rule_template_id`) REFERENCES `rule_templates`(`id`),
  FOREIGN KEY (`settlement_confirmed_by`) REFERENCES `accounts`(`id`)
);

CREATE INDEX `live_sessions_streamer_status_idx` ON `live_sessions` (`streamer_id`, `status`);
CREATE INDEX `live_sessions_streamer_started_idx` ON `live_sessions` (`streamer_id`, `started_at`);

CREATE TABLE `ranking_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `title` text NOT NULL,
  `round_no` integer NOT NULL,
  `style` text NOT NULL,
  `status` text DEFAULT 'draft' NOT NULL,
  `screenshot_id` text,
  `note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`)
);

CREATE INDEX `ranking_snapshots_session_round_idx` ON `ranking_snapshots` (`session_id`, `round_no`);
CREATE INDEX `ranking_snapshots_session_status_idx` ON `ranking_snapshots` (`session_id`, `status`);

CREATE TABLE `ranking_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `ranking_snapshot_id` text NOT NULL,
  `fan_id` text,
  `display_name_at_time` text NOT NULL,
  `douyin_name_at_time` text,
  `rank_order` integer NOT NULL,
  `gift_diamonds` integer DEFAULT 0 NOT NULL,
  `ticket_used` integer DEFAULT 0 NOT NULL,
  `manual_adjustment` integer DEFAULT 0 NOT NULL,
  `competition_score` integer DEFAULT 0 NOT NULL,
  `fan_type_at_time` text DEFAULT 'unknown' NOT NULL,
  `seat_decision` text DEFAULT 'pending' NOT NULL,
  `note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`ranking_snapshot_id`) REFERENCES `ranking_snapshots`(`id`),
  FOREIGN KEY (`fan_id`) REFERENCES `fans`(`id`)
);

CREATE INDEX `ranking_entries_snapshot_order_idx` ON `ranking_entries` (`ranking_snapshot_id`, `rank_order`);
CREATE INDEX `ranking_entries_fan_idx` ON `ranking_entries` (`fan_id`);
CREATE INDEX `ranking_entries_decision_idx` ON `ranking_entries` (`ranking_snapshot_id`, `seat_decision`);

CREATE TABLE `game_matches` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL,
  `ranking_snapshot_id` text,
  `match_no` integer NOT NULL,
  `mode` text NOT NULL,
  `season_id` text,
  `status` text DEFAULT 'preparing' NOT NULL,
  `started_at` text,
  `ended_at` text,
  `note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`),
  FOREIGN KEY (`ranking_snapshot_id`) REFERENCES `ranking_snapshots`(`id`),
  FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`)
);

CREATE INDEX `game_matches_session_no_idx` ON `game_matches` (`session_id`, `match_no`);
CREATE INDEX `game_matches_session_status_idx` ON `game_matches` (`session_id`, `status`);

CREATE TABLE `match_seats` (
  `id` text PRIMARY KEY NOT NULL,
  `match_id` text NOT NULL,
  `seat_no` integer NOT NULL,
  `fan_id` text,
  `seat_type` text NOT NULL,
  `game_name_at_time` text,
  `status` text DEFAULT 'alive' NOT NULL,
  `eliminated_at` text,
  `final_rank` integer,
  `note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`match_id`) REFERENCES `game_matches`(`id`),
  FOREIGN KEY (`fan_id`) REFERENCES `fans`(`id`)
);

CREATE UNIQUE INDEX `match_seats_match_seat_unique` ON `match_seats` (`match_id`, `seat_no`);
CREATE INDEX `match_seats_match_fan_idx` ON `match_seats` (`match_id`, `fan_id`);
CREATE INDEX `match_seats_match_status_idx` ON `match_seats` (`match_id`, `status`);

CREATE TABLE `card_locks` (
  `id` text PRIMARY KEY NOT NULL,
  `match_id` text NOT NULL,
  `seat_id` text NOT NULL,
  `card_id` text NOT NULL,
  `action` text NOT NULL,
  `is_active_occupy` integer DEFAULT 0 NOT NULL,
  `note` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`match_id`) REFERENCES `game_matches`(`id`),
  FOREIGN KEY (`seat_id`) REFERENCES `match_seats`(`id`),
  FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`)
);

CREATE INDEX `card_locks_match_seat_idx` ON `card_locks` (`match_id`, `seat_id`);
CREATE INDEX `card_locks_match_card_idx` ON `card_locks` (`match_id`, `card_id`);
CREATE INDEX `card_locks_active_idx` ON `card_locks` (`match_id`, `is_active_occupy`);

CREATE TABLE `ticket_ledgers` (
  `id` text PRIMARY KEY NOT NULL,
  `streamer_id` text NOT NULL,
  `fan_id` text NOT NULL,
  `session_id` text,
  `ranking_snapshot_id` text,
  `type` text NOT NULL,
  `amount` integer NOT NULL,
  `affects_balance` integer DEFAULT 0 NOT NULL,
  `affects_competition` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'normal' NOT NULL,
  `voided_by` text,
  `voided_at` text,
  `note` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`),
  FOREIGN KEY (`fan_id`) REFERENCES `fans`(`id`),
  FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`),
  FOREIGN KEY (`ranking_snapshot_id`) REFERENCES `ranking_snapshots`(`id`),
  FOREIGN KEY (`voided_by`) REFERENCES `accounts`(`id`),
  FOREIGN KEY (`created_by`) REFERENCES `accounts`(`id`)
);

CREATE INDEX `ticket_ledgers_streamer_fan_idx` ON `ticket_ledgers` (`streamer_id`, `fan_id`);
CREATE INDEX `ticket_ledgers_session_idx` ON `ticket_ledgers` (`session_id`);
CREATE INDEX `ticket_ledgers_ranking_idx` ON `ticket_ledgers` (`ranking_snapshot_id`);
CREATE INDEX `ticket_ledgers_status_idx` ON `ticket_ledgers` (`status`);
CREATE INDEX `ticket_ledgers_created_idx` ON `ticket_ledgers` (`created_at`);

CREATE TABLE `screenshots` (
  `id` text PRIMARY KEY NOT NULL,
  `streamer_id` text NOT NULL,
  `session_id` text,
  `match_id` text,
  `fan_id` text,
  `type` text NOT NULL,
  `storage_key` text NOT NULL,
  `original_name` text NOT NULL,
  `mime_type` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `is_public` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'normal' NOT NULL,
  `deleted_at` text,
  `note` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`),
  FOREIGN KEY (`session_id`) REFERENCES `live_sessions`(`id`),
  FOREIGN KEY (`match_id`) REFERENCES `game_matches`(`id`),
  FOREIGN KEY (`fan_id`) REFERENCES `fans`(`id`),
  FOREIGN KEY (`created_by`) REFERENCES `accounts`(`id`)
);

CREATE INDEX `screenshots_streamer_created_idx` ON `screenshots` (`streamer_id`, `created_at`);
CREATE INDEX `screenshots_session_idx` ON `screenshots` (`session_id`);
CREATE INDEX `screenshots_match_idx` ON `screenshots` (`match_id`);
CREATE INDEX `screenshots_fan_idx` ON `screenshots` (`fan_id`);
CREATE INDEX `screenshots_public_status_idx` ON `screenshots` (`is_public`, `status`);

CREATE TABLE `public_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `streamer_id` text NOT NULL,
  `module` text NOT NULL,
  `is_enabled` integer DEFAULT 0 NOT NULL,
  `visible_fields_json` text DEFAULT '[]' NOT NULL,
  `filterable_fields_json` text DEFAULT '[]' NOT NULL,
  `note` text,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`)
);

CREATE UNIQUE INDEX `public_settings_streamer_module_unique` ON `public_settings` (`streamer_id`, `module`);

CREATE TABLE `audit_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor_account_id` text NOT NULL,
  `actor_role` text NOT NULL,
  `streamer_id` text,
  `action` text NOT NULL,
  `target_type` text NOT NULL,
  `target_id` text NOT NULL,
  `before_json` text,
  `after_json` text,
  `note` text,
  `created_at` text NOT NULL,
  FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`),
  FOREIGN KEY (`streamer_id`) REFERENCES `streamers`(`id`)
);

CREATE INDEX `audit_logs_streamer_created_idx` ON `audit_logs` (`streamer_id`, `created_at`);
CREATE INDEX `audit_logs_actor_created_idx` ON `audit_logs` (`actor_account_id`, `created_at`);
CREATE INDEX `audit_logs_target_idx` ON `audit_logs` (`target_type`, `target_id`);
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);

