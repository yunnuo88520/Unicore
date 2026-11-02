-- Author: yunnuo <ymz@ebox.vip>
-- Fixed framework table prefix; core profiles only. Preserves rows and constraints.
-- Compatibility: apply after legacy framework/business migrations, under the instance startup lock.
-- Recovery: SQLite/PostgreSQL are transactional; MySQL uses one atomic multi-table rename.
-- Stop and restore a matching backup on conflicts; never drop a colliding table.
RENAME TABLE install_state TO unicore_install_state,
  system_settings TO unicore_system_settings,
  audit_logs TO unicore_audit_logs,
  example_notes TO unicore_example_notes,
  business_migrations TO unicore_business_migrations,
  schema_migrations TO unicore_schema_migrations;
