-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform final-state baseline; mysql; web-platform only.
-- Compatibility: pre-stable squash for fresh databases; previous development ledgers are rejected.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.
-- Baseline DDL and static seed rows are replay-idempotent; roles/accounts are initialized by Go Seed.

CREATE TABLE IF NOT EXISTS `unicore_roles` (
  `id` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
 `realm` VARCHAR(16) NOT NULL DEFAULT 'user',
 `data_scope` varchar(16) NOT NULL DEFAULT 'self'
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
  UNIQUE KEY `unicore_users_phone_key` (`phone`),
 `department_id` varchar(64) DEFAULT NULL
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

CREATE TABLE IF NOT EXISTS `unicore_menus` (
  `menu_key` varchar(64) NOT NULL,
  `label` varchar(80) NOT NULL DEFAULT '',
  `group_key` varchar(32) NOT NULL DEFAULT '',
  `sort` int NOT NULL DEFAULT 100,
  `visible` bigint NOT NULL DEFAULT 1,
  `updated_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`menu_key`),
 `parent_key` VARCHAR(64) NULL,
 `type` VARCHAR(16) NOT NULL DEFAULT 'page',
 `url` VARCHAR(2048) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_dict_types` (
  `id` varchar(64) NOT NULL,
  `code` varchar(64) NOT NULL,
  `name` varchar(80) NOT NULL,
  `description` varchar(200) NOT NULL DEFAULT '',
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_dict_items` (
  `id` varchar(64) NOT NULL,
  `type_code` varchar(64) NOT NULL,
  `value` varchar(128) NOT NULL,
  `label` varchar(80) NOT NULL,
  `remark` varchar(200) NOT NULL DEFAULT '',
  `sort` int NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unicore_dict_items_type_value` (`type_code`,`value`),
  KEY `unicore_dict_items_type_sort` (`type_code`,`sort`),
  CONSTRAINT `unicore_dict_items_type` FOREIGN KEY (`type_code`) REFERENCES `unicore_dict_types` (`code`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  PRIMARY KEY (`name`),
 `description` VARCHAR(200) NOT NULL DEFAULT '',
 `executor` VARCHAR(64) NOT NULL DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_account_avatars` (
  `user_id` varchar(64) NOT NULL,
  `creator_realm` varchar(16) NOT NULL,
  `file_id` varchar(80) NOT NULL DEFAULT '',
  `updated_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`user_id`,`creator_realm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_departments` (
  `id` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  `parent_id` varchar(64) DEFAULT NULL,
  `sibling_key` varchar(64) GENERATED ALWAYS AS (IFNULL(`parent_id`, '')) STORED,
  `sort` int NOT NULL DEFAULT 0,
  `created_at` bigint NOT NULL,
  `updated_at` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `unicore_departments_parent_id_idx` (`parent_id`),
  UNIQUE KEY `unicore_departments_sibling_name` (`name`, `sibling_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_role_departments` (
  `role_id` varchar(64) NOT NULL,
  `department_id` varchar(64) NOT NULL,
  PRIMARY KEY (`role_id`, `department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS unicore_navigation_state (id INTEGER PRIMARY KEY, version BIGINT NOT NULL, initialized INTEGER NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO unicore_navigation_state(id,version,initialized) SELECT 1,0,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_navigation_state WHERE id=1);
CREATE TABLE IF NOT EXISTS unicore_navigation_sections (id VARCHAR(64) PRIMARY KEY, surface VARCHAR(32) NOT NULL, payload TEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_navigation_nodes (id VARCHAR(64) NOT NULL, section_id VARCHAR(64) NOT NULL, node_type VARCHAR(16) NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(section_id, id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_role_authorizations (role_id VARCHAR(64) PRIMARY KEY, initialized INTEGER NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS unicore_role_menus (role_id VARCHAR(64) NOT NULL, menu_id VARCHAR(64) NOT NULL, PRIMARY KEY(role_id,menu_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_role_actions (role_id VARCHAR(64) NOT NULL, action_id VARCHAR(64) NOT NULL, PRIMARY KEY(role_id,action_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_role_operations (role_id VARCHAR(64) NOT NULL, operation_id VARCHAR(128) NOT NULL, PRIMARY KEY(role_id,operation_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS unicore_posts (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    sort INT NOT NULL DEFAULT 0,
    enabled INT NOT NULL DEFAULT 1,
    description VARCHAR(500) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX unicore_posts_sort_idx (sort, code, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_user_posts (
    user_id VARCHAR(64) NOT NULL,
    post_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, post_id),
    INDEX unicore_user_posts_post_idx (post_id, user_id),
    CONSTRAINT unicore_user_posts_user_fk FOREIGN KEY (user_id) REFERENCES unicore_users(id) ON DELETE CASCADE,
    CONSTRAINT unicore_user_posts_post_fk FOREIGN KEY (post_id) REFERENCES unicore_posts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS unicore_task_runs (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    job_name VARCHAR(64) NOT NULL,
    started_at BIGINT NOT NULL,
    duration_ms BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL,
    error VARCHAR(200) NOT NULL DEFAULT '',
    INDEX unicore_task_runs_job_idx (job_name, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS unicore_api_credentials (
 id VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL,
 kind VARCHAR(16) NOT NULL, name VARCHAR(80) NOT NULL,
 session_hash VARCHAR(64) NOT NULL UNIQUE, session_secret TEXT NOT NULL,
 operations TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
 last_used_at BIGINT NOT NULL, revoked INTEGER NOT NULL,
 INDEX unicore_api_credentials_owner_idx (user_id,kind,created_at),
 INDEX unicore_api_credentials_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS unicore_api_refresh_tokens (
 token_hash VARCHAR(64) NOT NULL PRIMARY KEY, credential_id VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL, used INTEGER NOT NULL,
 INDEX unicore_api_refresh_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS unicore_api_token_keys (
 id VARCHAR(64) NOT NULL PRIMARY KEY, secret TEXT NOT NULL,
 created_at BIGINT NOT NULL, valid_until BIGINT NOT NULL, active INTEGER NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
