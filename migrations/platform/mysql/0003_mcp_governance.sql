-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform 3 adds MCP governance storage: control CAS anchor, capability open policies and call metadata; mysql; web-platform only.
-- Compatibility: additive tables; policies start disabled and control starts at revision 0.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.

CREATE TABLE IF NOT EXISTS `unicore_mcp_control` (
  `id` bigint NOT NULL,
  `revision` bigint NOT NULL DEFAULT 0,
  `created_at` bigint NOT NULL DEFAULT 0,
  `updated_at` bigint NOT NULL DEFAULT 0,
  `updated_by` varchar(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO unicore_mcp_control(id,revision,created_at,updated_at,updated_by) SELECT 1,0,0,0,'' WHERE NOT EXISTS (SELECT 1 FROM unicore_mcp_control WHERE id=1);

CREATE TABLE IF NOT EXISTS `unicore_mcp_capability_policies` (
  `id` varchar(64) NOT NULL,
  `kind` varchar(16) NOT NULL,
  `name` varchar(128) NOT NULL,
  `enabled` integer NOT NULL DEFAULT 0,
  `accepted_fingerprint` varchar(64) NOT NULL DEFAULT '',
  `accepted_version` varchar(32) NOT NULL DEFAULT '',
  `version` bigint NOT NULL DEFAULT 1,
  `created_at` bigint NOT NULL DEFAULT 0,
  `updated_at` bigint NOT NULL DEFAULT 0,
  `updated_by` varchar(64) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unicore_mcp_policy_kind_name` (`kind`,`name`),
  KEY `unicore_mcp_policy_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `unicore_mcp_calls` (
  `id` varchar(64) NOT NULL,
  `request_id` varchar(64) NOT NULL,
  `actor_id` varchar(64) NOT NULL,
  `credential_id` varchar(64) NOT NULL,
  `role_id` varchar(64) NOT NULL,
  `auth_method` varchar(16) NOT NULL,
  `kind` varchar(16) NOT NULL,
  `name` varchar(128) NOT NULL,
  `capability_version` varchar(32) NOT NULL DEFAULT '',
  `policy_revision` bigint NOT NULL DEFAULT 0,
  `protocol_version` varchar(16) NOT NULL DEFAULT '',
  `client_name` varchar(80) NOT NULL DEFAULT '',
  `client_version` varchar(40) NOT NULL DEFAULT '',
  `status` varchar(16) NOT NULL DEFAULT '',
  `error_code` varchar(128) NOT NULL DEFAULT '',
  `started_at` bigint NOT NULL DEFAULT 0,
  `finished_at` bigint NOT NULL DEFAULT 0,
  `duration_ms` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unicore_mcp_calls_request` (`request_id`),
  KEY `unicore_mcp_calls_started` (`started_at`,`id`),
  KEY `unicore_mcp_calls_actor` (`actor_id`,`started_at`,`id`),
  KEY `unicore_mcp_calls_capability` (`kind`,`name`,`started_at`,`id`),
  KEY `unicore_mcp_calls_status` (`status`,`started_at`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
