-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform 5 adds the MCP OAuth authorization service storage: pre-registered clients, single-role grants, one-time codes and rotating token families; mysql; web-platform only.
-- Compatibility: additive tables; clients and grants start empty and disabled until the OAuth switch is reviewed.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.

CREATE TABLE IF NOT EXISTS `unicore_mcp_oauth_clients` (
  `id` varchar(64) NOT NULL,
  `name` varchar(80) NOT NULL,
  `client_type` varchar(16) NOT NULL,
  `auth_method` varchar(16) NOT NULL,
  `redirect_uris` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 0,
  `client_secret_hash` varchar(64) NOT NULL DEFAULT '',
  `version` bigint NOT NULL DEFAULT 1,
  `created_at` bigint NOT NULL DEFAULT 0,
  `updated_at` bigint NOT NULL DEFAULT 0,
  `updated_by` varchar(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_mcp_oauth_grants` (
  `id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  `client_id` varchar(64) NOT NULL,
  `role_id` varchar(64) NOT NULL,
  `resource` varchar(2048) NOT NULL,
  `scope_set` text NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `security_anchor` varchar(64) NOT NULL DEFAULT '',
  `created_at` bigint NOT NULL DEFAULT 0,
  `last_used_at` bigint NOT NULL DEFAULT 0,
  `revoked_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `unicore_mcp_grants_user` (`user_id`,`status`),
  KEY `unicore_mcp_grants_client` (`client_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_mcp_oauth_codes` (
  `code_hash` varchar(64) NOT NULL,
  `grant_id` varchar(64) NOT NULL,
  `redirect_uri` varchar(2048) NOT NULL,
  `pkce_challenge` varchar(128) NOT NULL DEFAULT '',
  `pkce_method` varchar(16) NOT NULL DEFAULT '',
  `expires_at` bigint NOT NULL,
  `consumed_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`code_hash`),
  KEY `unicore_mcp_codes_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_mcp_oauth_tokens` (
  `token_hash` varchar(64) NOT NULL,
  `kind` varchar(16) NOT NULL,
  `grant_id` varchar(64) NOT NULL,
  `family_id` varchar(64) NOT NULL,
  `parent_id` varchar(64) NOT NULL DEFAULT '',
  `scopes` text NOT NULL,
  `expires_at` bigint NOT NULL,
  `consumed_at` bigint NOT NULL DEFAULT 0,
  `revoked_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`token_hash`),
  KEY `unicore_mcp_tokens_grant` (`grant_id`,`kind`),
  KEY `unicore_mcp_tokens_family` (`family_id`,`kind`),
  KEY `unicore_mcp_tokens_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
