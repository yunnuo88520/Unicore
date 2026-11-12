-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: core version 1 final-state baseline; mysql; web-platform, web-standalone.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.

CREATE TABLE IF NOT EXISTS `unicore_install_state` (
  `id` int NOT NULL,
  `profile` varchar(32) NOT NULL,
  `instance_id` varchar(64) NOT NULL,
  `installed_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_system_settings` (
  `setting_key` varchar(128) NOT NULL,
  `setting_value` text NOT NULL,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_audit_logs` (
  `id` varchar(64) NOT NULL,
  `actor_id` varchar(64) NOT NULL,
  `action` varchar(128) NOT NULL,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_storage_locations` (
  `id` varchar(80) NOT NULL,
  `name` varchar(80) NOT NULL,
  `provider` varchar(16) NOT NULL,
  `endpoint` varchar(2048) NOT NULL,
  `bucket` varchar(128) NOT NULL,
  `region` varchar(128) NOT NULL,
  `prefix` varchar(200) NOT NULL,
  `path_style` int NOT NULL,
  `credentials` text NOT NULL,
  `tested` int NOT NULL,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_file_metadata` (
  `id` varchar(80) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `storage_type` varchar(16) NOT NULL,
  `location_id` varchar(80) NOT NULL,
  `file_key` varchar(1024) NOT NULL,
  `staging_key` varchar(1024) NOT NULL,
  `mime_type` varchar(160) NOT NULL,
  `size` bigint NOT NULL,
  `etag` varchar(200) NOT NULL,
  `state` varchar(16) NOT NULL,
  `purpose` varchar(16) NOT NULL,
  `creator_id` varchar(80) NOT NULL,
  `creator_realm` varchar(24) NOT NULL,
  `created_at` bigint NOT NULL,
  `expires_at` bigint NOT NULL,
  `upload_expires_at` bigint NOT NULL,
  `cleanup_at` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `file_owner_created` (`purpose`,`creator_realm`,`creator_id`,`created_at`,`id`),
  KEY `file_created` (`purpose`,`created_at`,`id`),
  KEY `file_location_state` (`location_id`,`state`),
  KEY `file_pending_cleanup` (`state`,`cleanup_at`),
  KEY `file_expiry` (`expires_at`),
  CONSTRAINT `file_metadata_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `unicore_storage_locations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_file_cleanup_jobs` (
  `id` varchar(80) NOT NULL,
  `location_id` varchar(80) NOT NULL,
  `file_key` varchar(1024) NOT NULL,
  `due_at` bigint NOT NULL,
  `attempts` int NOT NULL,
  `last_error` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `file_cleanup_due` (`due_at`),
  KEY `location_id` (`location_id`),
  CONSTRAINT `file_cleanup_jobs_ibfk_1` FOREIGN KEY (`location_id`) REFERENCES `unicore_storage_locations` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_file_upload_sessions` (
  `file_id` varchar(80) NOT NULL,
  `upload_id` text NOT NULL,
  `fingerprint` varchar(64) NOT NULL,
  `part_size` bigint NOT NULL,
  PRIMARY KEY (`file_id`),
  CONSTRAINT `file_upload_sessions_ibfk_1` FOREIGN KEY (`file_id`) REFERENCES `unicore_file_metadata` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'local','本地存储','local','','','','',1,'',1,0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='local');
