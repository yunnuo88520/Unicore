-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: module.notes version 1 final-state baseline; mysql; web-platform, web-standalone.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.

CREATE TABLE `example_notes` (
  `scope_key` varchar(96) NOT NULL,
  `id` varchar(64) NOT NULL,
  `title` varchar(120) NOT NULL,
  `body` text NOT NULL,
  `status` varchar(16) NOT NULL,
  `attachment_ids` text NOT NULL,
  `version` int NOT NULL,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  `deleted_at` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`scope_key`,`id`),
  KEY `example_notes_owner_updated` (`scope_key`,`updated_at`,`id`),
  KEY `idx_notes_active` (`scope_key`,`deleted_at`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
