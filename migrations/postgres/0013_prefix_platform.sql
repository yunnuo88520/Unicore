-- Author: yunnuo <ymz@ebox.vip>
-- Fixed framework table prefix; platform profiles only. Preserves rows and constraints.
-- Compatibility: apply after legacy framework/business migrations, under the instance startup lock.
-- Recovery: SQLite/PostgreSQL are transactional; MySQL uses one atomic multi-table rename.
-- Stop and restore a matching backup on conflicts; never drop a colliding table.
ALTER TABLE users RENAME TO unicore_users;
ALTER TABLE roles RENAME TO unicore_roles;
ALTER TABLE permissions RENAME TO unicore_permissions;
ALTER TABLE user_roles RENAME TO unicore_user_roles;
ALTER TABLE role_permissions RENAME TO unicore_role_permissions;
ALTER TABLE sessions RENAME TO unicore_sessions;
ALTER TABLE account_tokens RENAME TO unicore_account_tokens;
ALTER TABLE mail_jobs RENAME TO unicore_mail_jobs;
ALTER TABLE email_challenges RENAME TO unicore_email_challenges;
ALTER TABLE external_identities RENAME TO unicore_external_identities;
ALTER TABLE oidc_flows RENAME TO unicore_oidc_flows;
ALTER TABLE administrators RENAME TO unicore_administrators;
ALTER TABLE administrator_roles RENAME TO unicore_administrator_roles;
ALTER TABLE administrator_sessions RENAME TO unicore_administrator_sessions;
ALTER TABLE administrator_account_tokens RENAME TO unicore_administrator_account_tokens;
ALTER TABLE administrator_email_challenges RENAME TO unicore_administrator_email_challenges;
ALTER TABLE administrator_external_identities RENAME TO unicore_administrator_external_identities;
ALTER TABLE administrator_oidc_flows RENAME TO unicore_administrator_oidc_flows;
ALTER TABLE storage_locations RENAME TO unicore_storage_locations;
ALTER TABLE file_metadata RENAME TO unicore_file_metadata;
ALTER TABLE file_cleanup_jobs RENAME TO unicore_file_cleanup_jobs;
ALTER TABLE audit_metadata RENAME TO unicore_audit_metadata;
ALTER TABLE platform_announcements RENAME TO unicore_platform_announcements;
ALTER TABLE file_upload_sessions RENAME TO unicore_file_upload_sessions;
ALTER TABLE install_state RENAME TO unicore_install_state;
ALTER TABLE system_settings RENAME TO unicore_system_settings;
ALTER TABLE audit_logs RENAME TO unicore_audit_logs;
ALTER TABLE example_notes RENAME TO unicore_example_notes;
ALTER TABLE business_migrations RENAME TO unicore_business_migrations;
ALTER TABLE schema_migrations RENAME TO unicore_schema_migrations;
