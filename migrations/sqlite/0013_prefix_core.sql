-- Author: yunnuo <ymz@ebox.vip>
-- Fixed framework table prefix; core profiles only. Preserves rows and constraints.
-- Compatibility: apply after legacy framework/business migrations, under the instance startup lock.
-- Recovery: SQLite/PostgreSQL are transactional; MySQL uses one atomic multi-table rename.
-- Stop and restore a matching backup on conflicts; never drop a colliding table.
ALTER TABLE install_state RENAME TO unicore_install_state;
ALTER TABLE system_settings RENAME TO unicore_system_settings;
ALTER TABLE audit_logs RENAME TO unicore_audit_logs;
ALTER TABLE example_notes RENAME TO unicore_example_notes;
ALTER TABLE business_migrations RENAME TO unicore_business_migrations;
ALTER TABLE schema_migrations RENAME TO unicore_schema_migrations;
