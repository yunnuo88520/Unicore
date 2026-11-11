-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 2: operator-editable menu configuration and business data dictionaries.
-- Compatibility: additive empty tables; the seed supplies no rows, missing menu rows fall back to route defaults.
-- Recovery: transactional per statement; stop and restore a matching database backup after partial DDL; drop the tables to roll back.
CREATE TABLE IF NOT EXISTS `unicore_menus` (
  `menu_key` varchar(64) NOT NULL,
  `label` varchar(80) NOT NULL DEFAULT '',
  `group_key` varchar(32) NOT NULL DEFAULT '',
  `sort` int NOT NULL DEFAULT 100,
  `visible` bigint NOT NULL DEFAULT 1,
  `updated_at` bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (`menu_key`)
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
