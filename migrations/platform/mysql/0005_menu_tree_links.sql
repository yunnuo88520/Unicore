-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 5: multi-level menu tree and external link rows.
-- Profile: web-platform only.
-- Compatibility: unicore_menus gains parent_key (nullable, references another configured row key),
--  type (default 'page') and url (nullable, link rows only). Existing rows keep page semantics and
--  carry no seed data; route facts stay with the frontend, link rows are operator-created.
-- Recovery: MySQL commits each DDL statement implicitly, so an interrupted run can leave an applied
--  ALTER without a ledger row; re-running this version then fails on the already added column.
--  Recover by restoring the pre-migration database backup, or verify all three columns were fully
--  applied before re-registering the ledger row. No down SQL.
ALTER TABLE `unicore_menus`
 ADD COLUMN `parent_key` VARCHAR(64) NULL,
 ADD COLUMN `type` VARCHAR(16) NOT NULL DEFAULT 'page',
 ADD COLUMN `url` VARCHAR(2048) NULL;
