-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform final-state baseline (roles version CAS, inbox actions, MCP governance and OAuth storage); sqlite; web-platform, web-standalone and desktop.
-- Compatibility: pre-stable squash for fresh databases; previous development ledgers are rejected.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.
-- Baseline DDL and static seed rows are replay-idempotent; roles/accounts are initialized by Go Seed.

CREATE TABLE IF NOT EXISTS unicore_roles (id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(64) NOT NULL UNIQUE,
 realm VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (realm IN ('user','administrator')),
 data_scope VARCHAR(16) NOT NULL DEFAULT 'self' CHECK (data_scope IN ('all','dept','dept_and_below','custom','self')),
 version BIGINT NOT NULL DEFAULT 1
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
 read_at BIGINT NOT NULL DEFAULT 0,
 actions TEXT NOT NULL DEFAULT ''
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
 role_id VARCHAR(64) NOT NULL DEFAULT '', remark VARCHAR(500) NOT NULL DEFAULT '',
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
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

CREATE TABLE IF NOT EXISTS unicore_mcp_control (
 id INTEGER NOT NULL PRIMARY KEY,
 revision BIGINT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL DEFAULT 0,
 updated_by VARCHAR(64) NOT NULL DEFAULT ''
);
INSERT INTO unicore_mcp_control(id,revision,created_at,updated_at,updated_by) SELECT 1,0,0,0,'' WHERE NOT EXISTS (SELECT 1 FROM unicore_mcp_control WHERE id=1);

CREATE TABLE IF NOT EXISTS unicore_mcp_capability_policies (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 kind VARCHAR(16) NOT NULL,
 name VARCHAR(128) NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0,
 accepted_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
 accepted_version VARCHAR(32) NOT NULL DEFAULT '',
 version BIGINT NOT NULL DEFAULT 1,
 created_at BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL DEFAULT 0,
 updated_by VARCHAR(64) NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_mcp_policy_kind_name ON unicore_mcp_capability_policies(kind,name);
CREATE INDEX IF NOT EXISTS unicore_mcp_policy_enabled ON unicore_mcp_capability_policies(enabled);

CREATE TABLE IF NOT EXISTS unicore_mcp_calls (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 request_id VARCHAR(64) NOT NULL,
 actor_id VARCHAR(64) NOT NULL,
 credential_id VARCHAR(64) NOT NULL,
 role_id VARCHAR(64) NOT NULL,
 auth_method VARCHAR(16) NOT NULL,
 kind VARCHAR(16) NOT NULL,
 name VARCHAR(128) NOT NULL,
 capability_version VARCHAR(32) NOT NULL DEFAULT '',
 policy_revision BIGINT NOT NULL DEFAULT 0,
 protocol_version VARCHAR(16) NOT NULL DEFAULT '',
 client_name VARCHAR(80) NOT NULL DEFAULT '',
 client_version VARCHAR(40) NOT NULL DEFAULT '',
 status VARCHAR(16) NOT NULL DEFAULT '',
 error_code VARCHAR(128) NOT NULL DEFAULT '',
 started_at BIGINT NOT NULL DEFAULT 0,
 finished_at BIGINT NOT NULL DEFAULT 0,
 duration_ms BIGINT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_mcp_calls_request ON unicore_mcp_calls(request_id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_started ON unicore_mcp_calls(started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_actor ON unicore_mcp_calls(actor_id,started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_capability ON unicore_mcp_calls(kind,name,started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_status ON unicore_mcp_calls(status,started_at,id);

CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_clients (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 name VARCHAR(80) NOT NULL,
 client_type VARCHAR(16) NOT NULL,
 auth_method VARCHAR(16) NOT NULL,
 redirect_uris TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0,
 client_secret_hash VARCHAR(64) NOT NULL DEFAULT '',
 version BIGINT NOT NULL DEFAULT 1,
 created_at BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL DEFAULT 0,
 updated_by VARCHAR(64) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_grants (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL,
 client_id VARCHAR(64) NOT NULL,
 role_id VARCHAR(64) NOT NULL,
 resource VARCHAR(2048) NOT NULL,
 scope_set TEXT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'active',
 security_anchor VARCHAR(64) NOT NULL DEFAULT '',
 created_at BIGINT NOT NULL DEFAULT 0,
 last_used_at BIGINT NOT NULL DEFAULT 0,
 revoked_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS unicore_mcp_grants_user ON unicore_mcp_oauth_grants(user_id,status);
CREATE INDEX IF NOT EXISTS unicore_mcp_grants_client ON unicore_mcp_oauth_grants(client_id,status);

CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_codes (
 code_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 grant_id VARCHAR(64) NOT NULL,
 redirect_uri VARCHAR(2048) NOT NULL,
 pkce_challenge VARCHAR(128) NOT NULL DEFAULT '',
 pkce_method VARCHAR(16) NOT NULL DEFAULT '',
 scope_set TEXT NOT NULL DEFAULT '',
 expires_at BIGINT NOT NULL,
 consumed_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS unicore_mcp_codes_expiry ON unicore_mcp_oauth_codes(expires_at);

CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_tokens (
 token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 kind VARCHAR(16) NOT NULL,
 grant_id VARCHAR(64) NOT NULL,
 family_id VARCHAR(64) NOT NULL,
 parent_id VARCHAR(64) NOT NULL DEFAULT '',
 scopes TEXT NOT NULL DEFAULT '',
 expires_at BIGINT NOT NULL,
 consumed_at BIGINT NOT NULL DEFAULT 0,
 revoked_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_grant ON unicore_mcp_oauth_tokens(grant_id,kind);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_family ON unicore_mcp_oauth_tokens(family_id,kind);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_expiry ON unicore_mcp_oauth_tokens(expires_at);

-- Persistent token-family state: the issuance gate and revocation mark
-- serialize on this row, so a family can never hold a survivor that a
-- committed revocation never saw (the tokens-only guard lost that race on
-- PostgreSQL's separate INSERT/NOT EXISTS snapshots).
CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_families (
 family_id VARCHAR(64) NOT NULL PRIMARY KEY,
 grant_id VARCHAR(64) NOT NULL DEFAULT '',
 revoked_at BIGINT NOT NULL DEFAULT 0,
 deadline BIGINT NOT NULL DEFAULT 0
);
