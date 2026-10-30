-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: core version 1 final-state baseline; mysql; web-platform, web-standalone.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.

CREATE TABLE `install_state` (
  `id` int NOT NULL,
  `profile` varchar(32) NOT NULL,
  `instance_id` varchar(64) NOT NULL,
  `installed_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `system_settings` (
  `setting_key` varchar(128) NOT NULL,
  `setting_value` text NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `audit_logs` (
  `id` varchar(64) NOT NULL,
  `actor_id` varchar(64) NOT NULL,
  `action` varchar(128) NOT NULL,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
