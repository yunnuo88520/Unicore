-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 2: operator-editable menu configuration and business data dictionaries.
-- Compatibility: additive empty tables; the seed supplies no rows, missing menu rows fall back to route defaults.
-- Recovery: transactional; stop and restore a matching database backup after partial DDL; drop the tables to roll back.
CREATE TABLE IF NOT EXISTS unicore_menus (
 menu_key VARCHAR(64) NOT NULL PRIMARY KEY,
 label VARCHAR(80) NOT NULL DEFAULT '',
 group_key VARCHAR(32) NOT NULL DEFAULT '',
 sort INTEGER NOT NULL DEFAULT 100,
 visible INTEGER NOT NULL DEFAULT 1,
 updated_at BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS unicore_dict_types (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 code VARCHAR(64) NOT NULL UNIQUE,
 name VARCHAR(80) NOT NULL,
 description VARCHAR(200) NOT NULL DEFAULT '',
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_dict_items (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 type_code VARCHAR(64) NOT NULL,
 value VARCHAR(128) NOT NULL,
 label VARCHAR(80) NOT NULL,
 remark VARCHAR(200) NOT NULL DEFAULT '',
 sort INTEGER NOT NULL DEFAULT 0,
 status VARCHAR(16) NOT NULL DEFAULT 'active',
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_dict_items_type_value ON unicore_dict_items(type_code,value);
CREATE INDEX IF NOT EXISTS unicore_dict_items_type_sort ON unicore_dict_items(type_code,sort);
