-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform final-state baseline; sqlite; web-platform only.
-- Compatibility: pre-stable squash for fresh databases; previous development ledgers are rejected.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.
-- Baseline DDL and static seed rows are replay-idempotent; roles/accounts are initialized by Go Seed.

CREATE TABLE IF NOT EXISTS unicore_roles (id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(64) NOT NULL UNIQUE,
 realm VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (realm IN ('user','administrator')),
 data_scope VARCHAR(16) NOT NULL DEFAULT 'self' CHECK (data_scope IN ('all','dept','dept_and_below','custom','self'))
);

CREATE TABLE IF NOT EXISTS unicore_permissions (id VARCHAR(128) NOT NULL PRIMARY KEY);

CREATE TABLE IF NOT EXISTS unicore_users (id VARCHAR(64) NOT NULL PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL, status VARCHAR(16) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, last_login_at BIGINT NOT NULL, phone VARCHAR(21) NULL,
 department_id VARCHAR(64) NULL
);

CREATE TABLE IF NOT EXISTS unicore_user_roles (user_id VARCHAR(64) NOT NULL, role_id VARCHAR(64) NOT NULL, PRIMARY KEY (user_id, role_id));

CREATE TABLE IF NOT EXISTS unicore_role_permissions (role_id VARCHAR(64) NOT NULL, permission_id VARCHAR(128) NOT NULL, PRIMARY KEY (role_id, permission_id));

CREATE TABLE IF NOT EXISTS unicore_sessions (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_account_tokens (token_hash VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL, purpose VARCHAR(16) NOT NULL, expires_at BIGINT NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_mail_jobs (id VARCHAR(64) NOT NULL PRIMARY KEY, token_hash VARCHAR(64) NOT NULL, payload TEXT NOT NULL, state VARCHAR(16) NOT NULL, attempts INTEGER NOT NULL, created_at BIGINT NOT NULL, available_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, lease_id VARCHAR(64) NOT NULL, lease_until BIGINT NOT NULL, last_error VARCHAR(32) NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_email_challenges (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL,
 purpose VARCHAR(16) NOT NULL,
 code_digest VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS unicore_external_identities (
 identity_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL UNIQUE,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS unicore_oidc_flows (
 state_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 browser_hash VARCHAR(64) NOT NULL,
 sealed_payload TEXT NOT NULL,
 expires_at BIGINT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS unicore_audit_metadata (audit_id VARCHAR(64) NOT NULL PRIMARY KEY, actor_name VARCHAR(64) NOT NULL, realm VARCHAR(32) NOT NULL, target VARCHAR(256) NOT NULL, detail VARCHAR(512) NOT NULL, ip_address VARCHAR(64) NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_platform_announcements (
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
 version BIGINT NOT NULL DEFAULT 1,
 title VARCHAR(200) NOT NULL DEFAULT 'Announcement',
 notify_mode VARCHAR(16) NOT NULL DEFAULT 'silent',
 ends_at BIGINT NOT NULL DEFAULT 0,
 audience VARCHAR(16) NOT NULL DEFAULT 'all'
);

CREATE INDEX IF NOT EXISTS idx_announcements_feed ON unicore_platform_announcements(deleted_at,status,publish_at,id);

CREATE TABLE IF NOT EXISTS unicore_file_upload_sessions (
 file_id VARCHAR(80) NOT NULL PRIMARY KEY,
 upload_id TEXT NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,
 part_size BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS unicore_announcement_recipients (
 announcement_id VARCHAR(64) NOT NULL,
 user_id VARCHAR(64) NOT NULL,
 PRIMARY KEY (announcement_id,user_id)
);
CREATE TABLE IF NOT EXISTS unicore_announcement_reads (
 announcement_id VARCHAR(64) NOT NULL,
 user_id VARCHAR(64) NOT NULL,
 read_at BIGINT NOT NULL,
 PRIMARY KEY (announcement_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_users_phone_key ON unicore_users(phone);

CREATE TABLE IF NOT EXISTS unicore_personal_accounts (
 user_id VARCHAR(64) NOT NULL PRIMARY KEY,
 display_name VARCHAR(80) NOT NULL, totp_secret TEXT NOT NULL, recovery_digests TEXT NOT NULL,
 last_step BIGINT NOT NULL, setup_secret TEXT NOT NULL, setup_session VARCHAR(64) NOT NULL, setup_expires BIGINT NOT NULL, setup_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_session_details (
 token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL,
 ip_address VARCHAR(64) NOT NULL, user_agent VARCHAR(512) NOT NULL,
 created_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL, mfa_verified INTEGER NOT NULL, mfa_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_email_changes (
 id VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL,
 session_hash VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL,
 original_email VARCHAR(254) NOT NULL, target_email VARCHAR(254) NOT NULL,
 code_digest VARCHAR(64) NOT NULL, verified INTEGER NOT NULL, attempts INTEGER NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
);

INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'legacy-brand','历史品牌文件','local','','','','',1,'',1,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='legacy-brand');

INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'local','本地存储','local','','','','',1,'',1,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='local');

CREATE TABLE IF NOT EXISTS unicore_menus (
 menu_key VARCHAR(64) NOT NULL PRIMARY KEY,
 label VARCHAR(80) NOT NULL DEFAULT '',
 group_key VARCHAR(32) NOT NULL DEFAULT '',
 sort INTEGER NOT NULL DEFAULT 100,
 visible INTEGER NOT NULL DEFAULT 1,
 updated_at BIGINT NOT NULL DEFAULT 0,
 parent_key VARCHAR(64) NULL,
 type VARCHAR(16) NOT NULL DEFAULT 'page',
 url VARCHAR(2048) NULL
);
CREATE TABLE IF NOT EXISTS unicore_dict_types (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 code VARCHAR(64) NOT NULL UNIQUE,
 name VARCHAR(80) NOT NULL,
 description VARCHAR(200) NOT NULL DEFAULT '',
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_dict_items (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 type_code VARCHAR(64) NOT NULL,
 value VARCHAR(128) NOT NULL,
 label VARCHAR(80) NOT NULL,
 remark VARCHAR(200) NOT NULL DEFAULT '',
 sort INTEGER NOT NULL DEFAULT 0,
 status VARCHAR(16) NOT NULL DEFAULT 'active',
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_dict_items_type_value ON unicore_dict_items(type_code,value);
CREATE INDEX IF NOT EXISTS unicore_dict_items_type_sort ON unicore_dict_items(type_code,sort);

CREATE TABLE IF NOT EXISTS unicore_inbox_messages (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 recipient_id VARCHAR(64) NOT NULL,
 type VARCHAR(32) NOT NULL,
 source_id VARCHAR(64) NOT NULL DEFAULT '',
 title VARCHAR(200) NOT NULL,
 body TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 read_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS unicore_inbox_recipient ON unicore_inbox_messages(recipient_id,read_at,created_at);
CREATE TABLE IF NOT EXISTS unicore_scheduled_jobs (
 name VARCHAR(64) NOT NULL PRIMARY KEY,
 schedule VARCHAR(64) NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 last_run_at BIGINT NOT NULL DEFAULT 0,
 last_status VARCHAR(16) NOT NULL DEFAULT '',
 last_error VARCHAR(200) NOT NULL DEFAULT '',
 run_count BIGINT NOT NULL DEFAULT 0,
 next_run_at BIGINT NOT NULL DEFAULT 0,
 description VARCHAR(200) NOT NULL DEFAULT '',
 executor VARCHAR(64) NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS unicore_account_avatars (
 user_id VARCHAR(64) NOT NULL,
 creator_realm VARCHAR(16) NOT NULL,
 file_id VARCHAR(80) NOT NULL DEFAULT '',
 updated_at BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,creator_realm)
);

CREATE TABLE IF NOT EXISTS unicore_departments (id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NULL, sort INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);

CREATE INDEX IF NOT EXISTS unicore_departments_parent_id_idx ON unicore_departments(parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS unicore_departments_sibling_name ON unicore_departments(name, COALESCE(parent_id, ''));

CREATE TABLE IF NOT EXISTS unicore_role_departments (role_id VARCHAR(64) NOT NULL, department_id VARCHAR(64) NOT NULL, PRIMARY KEY (role_id, department_id));

CREATE TABLE IF NOT EXISTS unicore_navigation_state (id INTEGER PRIMARY KEY, version BIGINT NOT NULL, initialized INTEGER NOT NULL);
INSERT INTO unicore_navigation_state(id,version,initialized) SELECT 1,0,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_navigation_state WHERE id=1);
CREATE TABLE IF NOT EXISTS unicore_navigation_sections (id VARCHAR(64) NOT NULL PRIMARY KEY, surface VARCHAR(32) NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS unicore_navigation_nodes (id VARCHAR(64) NOT NULL, section_id VARCHAR(64) NOT NULL, node_type VARCHAR(16) NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(section_id, id));
CREATE TABLE IF NOT EXISTS unicore_role_authorizations (role_id VARCHAR(64) NOT NULL PRIMARY KEY, initialized INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_role_menus (role_id VARCHAR(64) NOT NULL, menu_id VARCHAR(64) NOT NULL, PRIMARY KEY(role_id,menu_id));
CREATE TABLE IF NOT EXISTS unicore_role_actions (role_id VARCHAR(64) NOT NULL, action_id VARCHAR(64) NOT NULL, PRIMARY KEY(role_id,action_id));
CREATE TABLE IF NOT EXISTS unicore_role_operations (role_id VARCHAR(64) NOT NULL, operation_id VARCHAR(128) NOT NULL, PRIMARY KEY(role_id,operation_id));

CREATE TABLE IF NOT EXISTS unicore_posts (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    description VARCHAR(500) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS unicore_posts_sort_idx ON unicore_posts(sort, code, id);
CREATE TABLE IF NOT EXISTS unicore_user_posts (
    user_id VARCHAR(64) NOT NULL,
    post_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS unicore_user_posts_post_idx ON unicore_user_posts(post_id, user_id);

CREATE TABLE IF NOT EXISTS unicore_task_runs (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 job_name VARCHAR(64) NOT NULL,
 started_at BIGINT NOT NULL,
 duration_ms BIGINT NOT NULL DEFAULT 0,
 status VARCHAR(16) NOT NULL,
 error VARCHAR(200) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS unicore_task_runs_job ON unicore_task_runs(job_name,started_at);

CREATE TABLE IF NOT EXISTS unicore_api_credentials (
 id VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL,
 kind VARCHAR(16) NOT NULL, name VARCHAR(80) NOT NULL,
 session_hash VARCHAR(64) NOT NULL UNIQUE, session_secret TEXT NOT NULL,
 operations TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
 last_used_at BIGINT NOT NULL, revoked INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_api_refresh_tokens (
 token_hash VARCHAR(64) NOT NULL PRIMARY KEY, credential_id VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL, used INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_api_token_keys (
 id VARCHAR(64) NOT NULL PRIMARY KEY, secret TEXT NOT NULL,
 created_at BIGINT NOT NULL, valid_until BIGINT NOT NULL, active INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS unicore_api_credentials_owner_idx ON unicore_api_credentials (user_id,kind,created_at);

CREATE INDEX IF NOT EXISTS unicore_api_credentials_expiry_idx ON unicore_api_credentials (expires_at);

CREATE INDEX IF NOT EXISTS unicore_api_refresh_expiry_idx ON unicore_api_refresh_tokens (expires_at);
