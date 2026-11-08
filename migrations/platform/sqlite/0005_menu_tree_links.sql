-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 5: multi-level menu tree and external link rows.
-- Profile: web-platform only.
-- Compatibility: unicore_menus gains parent_key (nullable, references another configured row key),
--  type (default 'page') and url (nullable, link rows only). Existing rows keep page semantics and
--  carry no seed data; route facts stay with the frontend, link rows are operator-created.
-- Recovery: SQLite runs transactional DDL, so an interrupted run rolls back completely; restore a
--  matching database backup after partial DDL. No down SQL.
ALTER TABLE unicore_menus ADD COLUMN parent_key VARCHAR(64) NULL;
ALTER TABLE unicore_menus ADD COLUMN type VARCHAR(16) NOT NULL DEFAULT 'page';
ALTER TABLE unicore_menus ADD COLUMN url VARCHAR(2048) NULL;
