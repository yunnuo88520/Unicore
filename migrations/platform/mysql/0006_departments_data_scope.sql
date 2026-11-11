-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 6: department organization tree and role data scopes.
-- Profile: web-platform only.
-- Compatibility: new unicore_departments table (string ids matching unicore_users, nullable parent
--  self-reference, same-parent name uniqueness through the stored sibling_key generated column because
--  MySQL has no partial/expression indexes), unicore_users gains department_id, unicore_roles gains
--  data_scope (default 'self') and unicore_role_departments carries the custom scope department set.
--  Existing rows keep self-only visibility; no seed data (application rows are operator-created).
-- Recovery: MySQL commits each DDL statement implicitly, so an interrupted run can leave an applied
--  statement without a ledger row; re-running this version then fails on the already created table or
--  added column. Recover by restoring the pre-migration database backup, or verify every statement was
--  fully applied before re-registering the ledger row. No down SQL.
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

ALTER TABLE `unicore_users` ADD COLUMN `department_id` varchar(64) DEFAULT NULL;

ALTER TABLE `unicore_roles` ADD COLUMN `data_scope` varchar(16) NOT NULL DEFAULT 'self';

CREATE TABLE IF NOT EXISTS `unicore_role_departments` (
  `role_id` varchar(64) NOT NULL,
  `department_id` varchar(64) NOT NULL,
  PRIMARY KEY (`role_id`, `department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
