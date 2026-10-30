-- Author: yunnuo <ymz@ebox.vip>
-- Generated from observed sqlite_schema; not a migration definition.
CREATE TABLE audit_logs (id VARCHAR(64) NOT NULL PRIMARY KEY, actor_id VARCHAR(64) NOT NULL, action VARCHAR(128) NOT NULL, created_at BIGINT NOT NULL);

CREATE TABLE example_notes (
 scope_key VARCHAR(96) NOT NULL,
 id VARCHAR(64) NOT NULL,
 title VARCHAR(120) NOT NULL,
 body TEXT NOT NULL,
 status VARCHAR(16) NOT NULL,
 attachment_ids TEXT NOT NULL,
 version INTEGER NOT NULL,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL, deleted_at BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(scope_key,id)
);

CREATE INDEX example_notes_owner_updated ON example_notes(scope_key,updated_at,id);

CREATE INDEX idx_notes_active ON example_notes(scope_key,deleted_at,updated_at);

CREATE TABLE install_state (id INTEGER PRIMARY KEY, profile VARCHAR(32) NOT NULL, instance_id VARCHAR(64) NOT NULL, installed_at BIGINT NOT NULL);

CREATE TABLE schema_migrations (
  namespace VARCHAR(96) NOT NULL,
  version BIGINT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at BIGINT NOT NULL,
  PRIMARY KEY (namespace, version)
);

CREATE TABLE system_settings (setting_key VARCHAR(128) NOT NULL PRIMARY KEY, setting_value TEXT NOT NULL);
