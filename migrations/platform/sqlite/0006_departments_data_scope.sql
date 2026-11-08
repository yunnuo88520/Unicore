-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 6: department organization tree and role data scopes.
-- Profile: web-platform only.
-- Compatibility: new unicore_departments table (string ids matching unicore_users, nullable parent
--  self-reference, same-parent name uniqueness via an expression index that treats NULL parent as ''),
--  unicore_users gains department_id, unicore_roles gains data_scope (default 'self') and
--  unicore_role_departments carries the custom scope department set. Existing rows keep self-only
--  visibility; no seed data (application rows are operator-created).
-- Recovery: SQLite runs transactional DDL, so an interrupted run rolls back completely; restore a
--  matching database backup after partial DDL. No down SQL.
CREATE TABLE IF NOT EXISTS unicore_departments (id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NULL, sort INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);

CREATE INDEX IF NOT EXISTS unicore_departments_parent_id_idx ON unicore_departments(parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS unicore_departments_sibling_name ON unicore_departments(name, COALESCE(parent_id, ''));

ALTER TABLE unicore_users ADD COLUMN department_id VARCHAR(64) NULL;

ALTER TABLE unicore_roles ADD COLUMN data_scope VARCHAR(16) NOT NULL DEFAULT 'self' CHECK (data_scope IN ('all','dept','dept_and_below','custom','self'));

CREATE TABLE IF NOT EXISTS unicore_role_departments (role_id VARCHAR(64) NOT NULL, department_id VARCHAR(64) NOT NULL, PRIMARY KEY (role_id, department_id));
