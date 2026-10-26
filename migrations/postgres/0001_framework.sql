-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: M2 framework schema (postgres).
-- Compatibility: additive CREATE IF NOT EXISTS; version checksum is immutable after release.
-- Rollback: restore an offline/native database backup; never drop populated identity tables automatically.
CREATE TABLE IF NOT EXISTS install_state (id INTEGER PRIMARY KEY, profile VARCHAR(32) NOT NULL, instance_id VARCHAR(64) NOT NULL, installed_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS system_settings (setting_key VARCHAR(128) PRIMARY KEY, setting_value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_logs (id VARCHAR(64) PRIMARY KEY, actor_id VARCHAR(64) NOT NULL, action VARCHAR(128) NOT NULL, created_at BIGINT NOT NULL);
