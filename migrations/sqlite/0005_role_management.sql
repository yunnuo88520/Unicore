-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Add role catalogue/edit permissions without changing existing grants.
-- Compatibility: additive, idempotent DML; platform only. Builtin role grants are preserved.
-- Rollback: stop the instance and restore the database/config/key backup; do not delete populated roles.
INSERT INTO permissions(id) SELECT 'roles:read' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE id='roles:read');
INSERT INTO permissions(id) SELECT 'roles:write' WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE id='roles:write');
INSERT INTO role_permissions(role_id,permission_id) SELECT 'super_admin','roles:read' WHERE EXISTS (SELECT 1 FROM roles WHERE id='super_admin') AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_id='super_admin' AND permission_id='roles:read');
INSERT INTO role_permissions(role_id,permission_id) SELECT 'super_admin','roles:write' WHERE EXISTS (SELECT 1 FROM roles WHERE id='super_admin') AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE role_id='super_admin' AND permission_id='roles:write');
