-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 1 final-state baseline; mysql; web-platform only.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.

CREATE TABLE IF NOT EXISTS `unicore_roles` (
  `id` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_permissions` (
  `id` varchar(128) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_users` (
  `id` varchar(64) NOT NULL,
  `username` varchar(64) NOT NULL,
  `email` varchar(254) NOT NULL,
  `password_hash` text NOT NULL,
  `status` varchar(16) NOT NULL,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  `last_login_at` bigint NOT NULL,
  `phone` varchar(21) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `unicore_users_phone_key` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;



CREATE TABLE IF NOT EXISTS `unicore_user_roles` (
  `user_id` varchar(64) NOT NULL,
  `role_id` varchar(64) NOT NULL,
  PRIMARY KEY (`user_id`,`role_id`),
  KEY `role_id` (`role_id`),
  CONSTRAINT `user_roles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `unicore_users` (`id`),
  CONSTRAINT `user_roles_ibfk_2` FOREIGN KEY (`role_id`) REFERENCES `unicore_roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_role_permissions` (
  `role_id` varchar(64) NOT NULL,
  `permission_id` varchar(128) NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `unicore_roles` (`id`),
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `unicore_permissions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_sessions` (
  `token_hash` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `expires_at` bigint NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `unicore_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_account_tokens` (
  `token_hash` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `purpose` varchar(16) NOT NULL,
  `expires_at` bigint NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `account_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `unicore_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_mail_jobs` (
  `id` varchar(64) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `payload` text NOT NULL,
  `state` varchar(16) NOT NULL,
  `attempts` int NOT NULL,
  `created_at` bigint NOT NULL,
  `available_at` bigint NOT NULL,
  `expires_at` bigint NOT NULL,
  `lease_id` varchar(64) NOT NULL,
  `lease_until` bigint NOT NULL,
  `last_error` varchar(32) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_email_challenges` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `purpose` varchar(16) NOT NULL,
  `code_digest` varchar(64) NOT NULL,
  `expires_at` bigint NOT NULL,
  `created_at` bigint NOT NULL,
  `attempts` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `email_challenges_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `unicore_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_external_identities` (
  `identity_hash` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `issuer` text NOT NULL,
  `subject` text NOT NULL,
  `created_at` bigint NOT NULL,
  PRIMARY KEY (`identity_hash`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `external_identities_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `unicore_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_oidc_flows` (
  `state_hash` varchar(64) NOT NULL,
  `browser_hash` varchar(64) NOT NULL,
  `sealed_payload` text NOT NULL,
  `expires_at` bigint NOT NULL,
  PRIMARY KEY (`state_hash`)
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

CREATE TABLE IF NOT EXISTS `unicore_audit_metadata` (
  `audit_id` varchar(64) NOT NULL,
  `actor_name` varchar(64) NOT NULL,
  `realm` varchar(32) NOT NULL,
  `target` varchar(256) NOT NULL,
  `detail` varchar(512) NOT NULL,
  `ip_address` varchar(64) NOT NULL,
  PRIMARY KEY (`audit_id`),
  CONSTRAINT `audit_metadata_ibfk_1` FOREIGN KEY (`audit_id`) REFERENCES `unicore_audit_logs` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_platform_announcements` (
  `id` varchar(64) NOT NULL,
  `content` text NOT NULL,
  `content_html` text NOT NULL,
  `format` varchar(16) NOT NULL,
  `type` varchar(16) NOT NULL,
  `note` varchar(400) NOT NULL,
  `status` varchar(16) NOT NULL,
  `publish_at` bigint NOT NULL,
  `created_by` varchar(64) NOT NULL,
  `updated_by` varchar(64) NOT NULL,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  `deleted_at` bigint NOT NULL DEFAULT '0',
  `version` bigint NOT NULL DEFAULT '1',
  `title` varchar(200) NOT NULL DEFAULT 'Announcement',
  `notify_mode` varchar(16) NOT NULL DEFAULT 'silent',
  `ends_at` bigint NOT NULL DEFAULT '0',
  `audience` varchar(16) NOT NULL DEFAULT 'all',
  PRIMARY KEY (`id`),
  KEY `idx_announcements_feed` (`deleted_at`,`status`,`publish_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_file_upload_sessions` (
  `file_id` varchar(80) NOT NULL,
  `upload_id` text NOT NULL,
  `fingerprint` varchar(64) NOT NULL,
  `part_size` bigint NOT NULL,
  PRIMARY KEY (`file_id`),
  CONSTRAINT `file_upload_sessions_ibfk_1` FOREIGN KEY (`file_id`) REFERENCES `unicore_file_metadata` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_announcement_recipients` (
  `announcement_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  PRIMARY KEY (`announcement_id`,`user_id`),
  CONSTRAINT `unicore_announcement_recipients_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `unicore_platform_announcements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `unicore_announcement_recipients_user` FOREIGN KEY (`user_id`) REFERENCES `unicore_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_announcement_reads` (
  `announcement_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `read_at` bigint NOT NULL,
  PRIMARY KEY (`announcement_id`,`user_id`),
  CONSTRAINT `unicore_announcement_reads_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `unicore_platform_announcements` (`id`) ON DELETE CASCADE,
  CONSTRAINT `unicore_announcement_reads_user` FOREIGN KEY (`user_id`) REFERENCES `unicore_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS unicore_personal_accounts (
 user_id VARCHAR(64) NOT NULL PRIMARY KEY REFERENCES unicore_users(id),
 display_name VARCHAR(80) NOT NULL, totp_secret TEXT NOT NULL, recovery_digests TEXT NOT NULL,
 last_step BIGINT NOT NULL, setup_secret TEXT NOT NULL, setup_session VARCHAR(64) NOT NULL, setup_expires BIGINT NOT NULL, setup_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_session_details (
 token_hash VARCHAR(64) NOT NULL PRIMARY KEY REFERENCES unicore_sessions(token_hash) ON DELETE CASCADE,
 user_id VARCHAR(64) NOT NULL REFERENCES unicore_users(id),
 ip_address VARCHAR(64) NOT NULL, user_agent VARCHAR(512) NOT NULL,
 created_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL, mfa_verified INTEGER NOT NULL, mfa_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_email_changes (
 id VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES unicore_users(id),
 session_hash VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL,
 original_email VARCHAR(254) NOT NULL, target_email VARCHAR(254) NOT NULL,
 code_digest VARCHAR(64) NOT NULL, verified INTEGER NOT NULL, attempts INTEGER NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
);




INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'legacy-brand','历史品牌文件','local','','','','',1,'',1,0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='legacy-brand');

INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'local','本地存储','local','','','','',1,'',1,0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='local');
