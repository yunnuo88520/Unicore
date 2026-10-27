-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Fixed administrator/member roles and client-local platform appearance (sqlite).
-- Compatibility: existing administrators/accounts remain; custom-role users become ordinary users.
-- Rollback: restore the stopped instance DB/config/key snapshot; legacy role definitions are removed.
INSERT INTO roles(id,name) SELECT 'super_admin','super_admin' WHERE NOT EXISTS (SELECT 1 FROM roles WHERE id='super_admin');
INSERT INTO roles(id,name) SELECT 'user','user' WHERE NOT EXISTS (SELECT 1 FROM roles WHERE id='user');
DELETE FROM user_roles WHERE role_id NOT IN ('super_admin','user');
DELETE FROM user_roles WHERE role_id='user' AND user_id IN (SELECT user_id FROM user_roles WHERE role_id='super_admin');
INSERT INTO user_roles(user_id,role_id) SELECT u.id,'user' FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id);
DELETE FROM role_permissions WHERE role_id<>'super_admin' OR permission_id='roles:write';
DELETE FROM roles WHERE id NOT IN ('super_admin','user');
DELETE FROM permissions WHERE id='roles:write';
DELETE FROM system_settings WHERE setting_key='appearance.theme';
DELETE FROM sessions;
DELETE FROM account_tokens;
DELETE FROM email_challenges;
DELETE FROM oidc_flows;
UPDATE mail_jobs SET state='cancelled',payload='',lease_id='',lease_until=0 WHERE state IN ('pending','sending');
