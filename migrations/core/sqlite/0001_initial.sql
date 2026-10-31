-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: core version 1 final-state baseline; sqlite; web-platform, web-standalone, desktop.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.
-- Text/composite primary keys reject NULL; INTEGER PRIMARY KEY retains rowid allocation.

CREATE TABLE install_state (id INTEGER PRIMARY KEY, profile VARCHAR(32) NOT NULL, instance_id VARCHAR(64) NOT NULL, installed_at BIGINT NOT NULL);

CREATE TABLE system_settings (setting_key VARCHAR(128) NOT NULL PRIMARY KEY, setting_value TEXT NOT NULL);

CREATE TABLE audit_logs (id VARCHAR(64) NOT NULL PRIMARY KEY, actor_id VARCHAR(64) NOT NULL, action VARCHAR(128) NOT NULL, created_at BIGINT NOT NULL);
