-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 3: personal inbox messages, scheduled job registry and account avatars.
-- Profile: web-platform only.
-- Compatibility: additive empty tables; the scheduler seeds its builtin rows at startup.
-- Recovery: MySQL DDL implicitly commits; replay IF NOT EXISTS after interruption, or restore matching DB/data/binary snapshots to a new target. No down SQL.
CREATE TABLE IF NOT EXISTS `unicore_inbox_messages` (
  `id` varchar(64) NOT NULL,
  `recipient_id` varchar(64) NOT NULL,
  `type` varchar(32) NOT NULL,
  `source_id` varchar(64) NOT NULL DEFAULT '',
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `created_at` bigint NOT NULL,
  `read_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `unicore_inbox_recipient` (`recipient_id`,`read_at`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_scheduled_jobs` (
  `name` varchar(64) NOT NULL,
  `schedule` varchar(64) NOT NULL,
  `enabled` bigint NOT NULL DEFAULT 1,
  `last_run_at` bigint NOT NULL DEFAULT 0,
  `last_status` varchar(16) NOT NULL DEFAULT '',
  `last_error` varchar(200) NOT NULL DEFAULT '',
  `run_count` bigint NOT NULL DEFAULT 0,
  `next_run_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_account_avatars` (
  `user_id` varchar(64) NOT NULL,
  `creator_realm` varchar(16) NOT NULL,
  `file_id` varchar(80) NOT NULL DEFAULT '',
  `updated_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`,`creator_realm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
