-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 4: administrator realm dynamic roles (restricted administrators).
-- Profile: web-platform only.
-- Compatibility: unicore_roles gains realm (default 'user', CHECK restricts to user/administrator on sqlite);
--  the super_admin row is marked 'administrator' and the administrator membership column becomes administrator_id.
--  Existing role and membership rows are preserved; new columns carry no seed data (Go Seed/EnsurePermissions own catalog rows).
-- Recovery: SQLite runs transactional DDL, so an interrupted run rolls back completely; restore a matching database backup after partial DDL. No down SQL.
ALTER TABLE unicore_roles ADD COLUMN realm VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (realm IN ('user','administrator'));
UPDATE unicore_roles SET realm='administrator' WHERE id='super_admin' AND realm<>'administrator';
ALTER TABLE unicore_administrator_roles RENAME COLUMN user_id TO administrator_id;
