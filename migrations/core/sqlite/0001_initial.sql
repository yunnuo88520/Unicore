-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: core version 1 final-state baseline; sqlite; web-platform, web-standalone, desktop.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Text/composite primary keys reject NULL; INTEGER PRIMARY KEY retains rowid allocation.

CREATE TABLE IF NOT EXISTS unicore_install_state (id INTEGER PRIMARY KEY, profile VARCHAR(32) NOT NULL, instance_id VARCHAR(64) NOT NULL, installed_at BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_system_settings (setting_key VARCHAR(128) NOT NULL PRIMARY KEY, setting_value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_audit_logs (id VARCHAR(64) NOT NULL PRIMARY KEY, actor_id VARCHAR(64) NOT NULL, action VARCHAR(128) NOT NULL, created_at BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_storage_locations (
 id VARCHAR(80) NOT NULL PRIMARY KEY, name VARCHAR(80) NOT NULL, provider VARCHAR(16) NOT NULL,
 endpoint VARCHAR(2048) NOT NULL, bucket VARCHAR(128) NOT NULL, region VARCHAR(128) NOT NULL,
 prefix VARCHAR(200) NOT NULL, path_style INTEGER NOT NULL, credentials TEXT NOT NULL,
 tested INTEGER NOT NULL, created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS unicore_file_metadata (
 id VARCHAR(80) NOT NULL PRIMARY KEY, original_name VARCHAR(255) NOT NULL,
 storage_type VARCHAR(16) NOT NULL, location_id VARCHAR(80) NOT NULL,
 file_key VARCHAR(1024) NOT NULL, staging_key VARCHAR(1024) NOT NULL,
 mime_type VARCHAR(160) NOT NULL, size BIGINT NOT NULL, etag VARCHAR(200) NOT NULL,
 state VARCHAR(16) NOT NULL, purpose VARCHAR(16) NOT NULL,
 creator_id VARCHAR(80) NOT NULL, creator_realm VARCHAR(24) NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, upload_expires_at BIGINT NOT NULL, cleanup_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS file_expiry ON unicore_file_metadata(expires_at);

CREATE INDEX IF NOT EXISTS file_pending_cleanup ON unicore_file_metadata(state,cleanup_at);

CREATE INDEX IF NOT EXISTS file_location_state ON unicore_file_metadata(location_id,state);

CREATE INDEX IF NOT EXISTS file_created ON unicore_file_metadata(purpose,created_at,id);

CREATE INDEX IF NOT EXISTS file_owner_created ON unicore_file_metadata(purpose,creator_realm,creator_id,created_at,id);

CREATE TABLE IF NOT EXISTS unicore_file_cleanup_jobs (
 id VARCHAR(80) NOT NULL PRIMARY KEY, location_id VARCHAR(80) NOT NULL,
 file_key VARCHAR(1024) NOT NULL, due_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL, last_error VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS file_cleanup_location ON unicore_file_cleanup_jobs(location_id);

CREATE INDEX IF NOT EXISTS file_cleanup_due ON unicore_file_cleanup_jobs(due_at);

CREATE TABLE IF NOT EXISTS unicore_file_upload_sessions (
 file_id VARCHAR(80) NOT NULL PRIMARY KEY,
 upload_id TEXT NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,
 part_size BIGINT NOT NULL
);

INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'local','本地存储','local','','','','',1,'',1,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='local');
