-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Platform private file metadata, immutable storage locations and durable cleanup.
-- Compatibility: additive, framework-only profiles remain at 0001; no previous checksum changes.
-- Recovery: stop service and restore matching DB/data/key/binary plus independent bucket backup.
CREATE TABLE IF NOT EXISTS storage_locations (
 id VARCHAR(80) PRIMARY KEY, name VARCHAR(80) NOT NULL, provider VARCHAR(16) NOT NULL,
 endpoint VARCHAR(2048) NOT NULL, bucket VARCHAR(128) NOT NULL, region VARCHAR(128) NOT NULL,
 prefix VARCHAR(200) NOT NULL, path_style INTEGER NOT NULL, credentials TEXT NOT NULL,
 tested INTEGER NOT NULL, created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS file_metadata (
 id VARCHAR(80) PRIMARY KEY, original_name VARCHAR(255) NOT NULL,
 storage_type VARCHAR(16) NOT NULL, location_id VARCHAR(80) NOT NULL,
 file_key VARCHAR(1024) NOT NULL, staging_key VARCHAR(1024) NOT NULL,
 mime_type VARCHAR(160) NOT NULL, size BIGINT NOT NULL, etag VARCHAR(200) NOT NULL,
 state VARCHAR(16) NOT NULL, purpose VARCHAR(16) NOT NULL,
 creator_id VARCHAR(80) NOT NULL, creator_realm VARCHAR(24) NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, upload_expires_at BIGINT NOT NULL, cleanup_at BIGINT NOT NULL,
 FOREIGN KEY (location_id) REFERENCES storage_locations(id)
);
CREATE TABLE IF NOT EXISTS file_cleanup_jobs (
 id VARCHAR(80) PRIMARY KEY, location_id VARCHAR(80) NOT NULL,
 file_key VARCHAR(1024) NOT NULL, due_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL, last_error VARCHAR(64) NOT NULL,
 FOREIGN KEY (location_id) REFERENCES storage_locations(id)
);
CREATE INDEX IF NOT EXISTS file_owner_created ON file_metadata(purpose,creator_realm,creator_id,created_at,id);
CREATE INDEX IF NOT EXISTS file_created ON file_metadata(purpose,created_at,id);
CREATE INDEX IF NOT EXISTS file_location_state ON file_metadata(location_id,state);
CREATE INDEX IF NOT EXISTS file_pending_cleanup ON file_metadata(state,cleanup_at);
CREATE INDEX IF NOT EXISTS file_expiry ON file_metadata(expires_at);
CREATE INDEX IF NOT EXISTS file_cleanup_due ON file_cleanup_jobs(due_at);
CREATE INDEX IF NOT EXISTS file_cleanup_location ON file_cleanup_jobs(location_id);
INSERT INTO storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'local','本地存储','local','','','','',1,'',1,0 WHERE NOT EXISTS (SELECT 1 FROM storage_locations WHERE id='local');
INSERT INTO storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'legacy-brand','历史品牌文件','local','','','','',1,'',1,0 WHERE NOT EXISTS (SELECT 1 FROM storage_locations WHERE id='legacy-brand');
