-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 1 final-state baseline; sqlite; web-platform only.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.
-- Text/composite primary keys reject NULL; INTEGER PRIMARY KEY retains rowid allocation.

CREATE TABLE roles (id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(64) NOT NULL UNIQUE);

CREATE TABLE permissions (id VARCHAR(128) NOT NULL PRIMARY KEY);

CREATE TABLE users (id VARCHAR(64) NOT NULL PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL, status VARCHAR(16) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, last_login_at BIGINT NOT NULL);

CREATE TABLE administrators (id VARCHAR(64) NOT NULL PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL, status VARCHAR(16) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, last_login_at BIGINT NOT NULL);

CREATE TABLE user_roles (user_id VARCHAR(64) NOT NULL REFERENCES users(id), role_id VARCHAR(64) NOT NULL REFERENCES roles(id), PRIMARY KEY (user_id, role_id));

CREATE TABLE role_permissions (role_id VARCHAR(64) NOT NULL REFERENCES roles(id), permission_id VARCHAR(128) NOT NULL REFERENCES permissions(id), PRIMARY KEY (role_id, permission_id));

CREATE TABLE sessions (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL);

CREATE TABLE account_tokens (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES users(id), purpose VARCHAR(16) NOT NULL, expires_at BIGINT NOT NULL);

CREATE TABLE mail_jobs (id VARCHAR(64) NOT NULL PRIMARY KEY, token_hash VARCHAR(64) NOT NULL, payload TEXT NOT NULL, state VARCHAR(16) NOT NULL, attempts INTEGER NOT NULL, created_at BIGINT NOT NULL, available_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, lease_id VARCHAR(64) NOT NULL, lease_until BIGINT NOT NULL, last_error VARCHAR(32) NOT NULL);

CREATE TABLE email_challenges (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL,
 purpose VARCHAR(16) NOT NULL,
 code_digest VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE external_identities (
 identity_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL UNIQUE,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE oidc_flows (
 state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 browser_hash VARCHAR(64) NOT NULL,
 sealed_payload TEXT NOT NULL,
 expires_at BIGINT NOT NULL
);

CREATE TABLE administrator_roles (user_id VARCHAR(64) NOT NULL REFERENCES administrators(id), role_id VARCHAR(64) NOT NULL REFERENCES roles(id), PRIMARY KEY (user_id, role_id));

CREATE TABLE administrator_sessions (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES administrators(id), expires_at BIGINT NOT NULL);

CREATE TABLE administrator_account_tokens (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES administrators(id), purpose VARCHAR(16) NOT NULL, expires_at BIGINT NOT NULL);

CREATE TABLE administrator_email_challenges (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL,
 purpose VARCHAR(16) NOT NULL,
 code_digest VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL,
 FOREIGN KEY (user_id) REFERENCES administrators(id)
);

CREATE TABLE administrator_external_identities (
 identity_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL UNIQUE,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES administrators(id)
);

CREATE TABLE administrator_oidc_flows (
 state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 browser_hash VARCHAR(64) NOT NULL,
 sealed_payload TEXT NOT NULL,
 expires_at BIGINT NOT NULL
);

CREATE TABLE storage_locations (
 id VARCHAR(80) NOT NULL PRIMARY KEY, name VARCHAR(80) NOT NULL, provider VARCHAR(16) NOT NULL,
 endpoint VARCHAR(2048) NOT NULL, bucket VARCHAR(128) NOT NULL, region VARCHAR(128) NOT NULL,
 prefix VARCHAR(200) NOT NULL, path_style INTEGER NOT NULL, credentials TEXT NOT NULL,
 tested INTEGER NOT NULL, created_at BIGINT NOT NULL
);

CREATE TABLE file_metadata (
 id VARCHAR(80) NOT NULL PRIMARY KEY, original_name VARCHAR(255) NOT NULL,
 storage_type VARCHAR(16) NOT NULL, location_id VARCHAR(80) NOT NULL,
 file_key VARCHAR(1024) NOT NULL, staging_key VARCHAR(1024) NOT NULL,
 mime_type VARCHAR(160) NOT NULL, size BIGINT NOT NULL, etag VARCHAR(200) NOT NULL,
 state VARCHAR(16) NOT NULL, purpose VARCHAR(16) NOT NULL,
 creator_id VARCHAR(80) NOT NULL, creator_realm VARCHAR(24) NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, upload_expires_at BIGINT NOT NULL, cleanup_at BIGINT NOT NULL,
 FOREIGN KEY (location_id) REFERENCES storage_locations(id)
);

CREATE INDEX file_expiry ON file_metadata(expires_at);

CREATE INDEX file_pending_cleanup ON file_metadata(state,cleanup_at);

CREATE INDEX file_location_state ON file_metadata(location_id,state);

CREATE INDEX file_created ON file_metadata(purpose,created_at,id);

CREATE INDEX file_owner_created ON file_metadata(purpose,creator_realm,creator_id,created_at,id);

CREATE TABLE file_cleanup_jobs (
 id VARCHAR(80) NOT NULL PRIMARY KEY, location_id VARCHAR(80) NOT NULL,
 file_key VARCHAR(1024) NOT NULL, due_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL, last_error VARCHAR(64) NOT NULL,
 FOREIGN KEY (location_id) REFERENCES storage_locations(id)
);

CREATE INDEX file_cleanup_location ON file_cleanup_jobs(location_id);

CREATE INDEX file_cleanup_due ON file_cleanup_jobs(due_at);

CREATE TABLE audit_metadata (audit_id VARCHAR(64) NOT NULL PRIMARY KEY, actor_name VARCHAR(64) NOT NULL, realm VARCHAR(32) NOT NULL, target VARCHAR(256) NOT NULL, detail VARCHAR(512) NOT NULL, ip_address VARCHAR(64) NOT NULL, FOREIGN KEY (audit_id) REFERENCES audit_logs(id));

CREATE TABLE platform_announcements (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 content TEXT NOT NULL,
 content_html TEXT NOT NULL,
 format VARCHAR(16) NOT NULL,
 type VARCHAR(16) NOT NULL,
 note VARCHAR(400) NOT NULL,
 status VARCHAR(16) NOT NULL,
 publish_at BIGINT NOT NULL,
 created_by VARCHAR(64) NOT NULL,
 updated_by VARCHAR(64) NOT NULL,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 deleted_at BIGINT NOT NULL DEFAULT 0,
 version BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX idx_announcements_feed ON platform_announcements(deleted_at,status,publish_at,id);

CREATE TABLE file_upload_sessions (
 file_id VARCHAR(80) NOT NULL PRIMARY KEY,
 upload_id TEXT NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,
 part_size BIGINT NOT NULL,
 FOREIGN KEY (file_id) REFERENCES file_metadata(id)
);

INSERT INTO storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) VALUES('legacy-brand','历史品牌文件','local','','','','',1,'',1,0);

INSERT INTO storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) VALUES('local','本地存储','local','','','','',1,'',1,0);
