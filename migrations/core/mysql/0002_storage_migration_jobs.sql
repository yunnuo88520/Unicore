-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Durable storage migration jobs and per-file failure records behind the platform file governance.
-- Profiles: web-platform, web-standalone and desktop; only web-platform runs migration workers.
-- Compatibility: Append to core@1; new tables only, no change to existing rows or semantics. No foreign keys so job history outlives location removal.
-- Recovery: Stop on failure; MySQL DDL may commit before the ledger. Restore the matching pre-upgrade snapshot to a new empty target.

CREATE TABLE IF NOT EXISTS `unicore_storage_migration_jobs` (
  `id` varchar(80) NOT NULL,
  `source_location_id` varchar(80) NOT NULL,
  `target_location_id` varchar(80) NOT NULL,
  `status` varchar(16) NOT NULL,
  `mode` varchar(16) NOT NULL,
  `activate_on_complete` int NOT NULL,
  `total_count` bigint NOT NULL,
  `succeeded_count` bigint NOT NULL,
  `failed_count` bigint NOT NULL,
  `scan_cursor` varchar(80) NOT NULL,
  `created_by` varchar(80) NOT NULL,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  `finished_at` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `migration_job_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_storage_migration_failures` (
  `job_id` varchar(80) NOT NULL,
  `file_id` varchar(80) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `reason` varchar(64) NOT NULL,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`job_id`, `file_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
