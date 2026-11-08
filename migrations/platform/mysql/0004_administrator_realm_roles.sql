-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 4: administrator realm dynamic roles (restricted administrators).
-- Profile: web-platform only.
-- Compatibility: unicore_roles gains realm (default 'user'); the super_admin row is marked 'administrator'
--  and the administrator membership column becomes administrator_id (the foreign key follows the rename; MySQL 8.0 syntax).
--  Existing role and membership rows are preserved; new columns carry no seed data (Go Seed/EnsurePermissions own catalog rows).
-- Recovery: MySQL commits each DDL statement implicitly, so an interrupted run can leave an applied ALTER without a
--  ledger row; re-running this version then fails on the already renamed/added column. Recover by restoring the
--  pre-migration database backup, or verify both columns were fully applied before re-registering the ledger row. No down SQL.
ALTER TABLE `unicore_roles` ADD COLUMN `realm` VARCHAR(16) NOT NULL DEFAULT 'user';
UPDATE `unicore_roles` SET `realm`='administrator' WHERE `id`='super_admin' AND `realm`<>'administrator';
ALTER TABLE `unicore_administrator_roles` RENAME COLUMN `user_id` TO `administrator_id`;
