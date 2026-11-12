-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform final-state baseline; postgres; web-platform only.
-- Compatibility: pre-stable squash for fresh databases; previous development ledgers are rejected.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.
-- Baseline DDL and static seed rows are replay-idempotent; roles/accounts are initialized by Go Seed.

CREATE TABLE IF NOT EXISTS public."unicore_roles" (
  "id" character varying(64) NOT NULL,
  "name" character varying(64) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY (id),
  CONSTRAINT "roles_name_key" UNIQUE (name),
 realm VARCHAR(16) NOT NULL DEFAULT 'user',
 data_scope VARCHAR(16) NOT NULL DEFAULT 'self'
);

CREATE TABLE IF NOT EXISTS public."unicore_permissions" (
  "id" character varying(128) NOT NULL,
  CONSTRAINT "permissions_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."unicore_users" (
  "id" character varying(64) NOT NULL,
  "username" character varying(64) NOT NULL,
  "email" character varying(254) NOT NULL,
  "password_hash" text NOT NULL,
  "status" character varying(16) NOT NULL,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "last_login_at" bigint NOT NULL,
  "phone" character varying(21),
  CONSTRAINT "users_pkey" PRIMARY KEY (id),
  CONSTRAINT "users_email_key" UNIQUE (email),
  CONSTRAINT "users_username_key" UNIQUE (username),
 department_id VARCHAR(64) NULL
);

CREATE TABLE IF NOT EXISTS public."unicore_user_roles" (
  "user_id" character varying(64) NOT NULL,
  "role_id" character varying(64) NOT NULL,
  CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES unicore_roles(id),
  CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES unicore_users(id),
  CONSTRAINT "user_roles_pkey" PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS public."unicore_role_permissions" (
  "role_id" character varying(64) NOT NULL,
  "permission_id" character varying(128) NOT NULL,
  CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES unicore_permissions(id),
  CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES unicore_roles(id),
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public."unicore_sessions" (
  "token_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES unicore_users(id),
  CONSTRAINT "sessions_pkey" PRIMARY KEY (token_hash)
);

CREATE TABLE IF NOT EXISTS public."unicore_account_tokens" (
  "token_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "purpose" character varying(16) NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "account_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES unicore_users(id),
  CONSTRAINT "account_tokens_pkey" PRIMARY KEY (token_hash)
);

CREATE TABLE IF NOT EXISTS public."unicore_mail_jobs" (
  "id" character varying(64) NOT NULL,
  "token_hash" character varying(64) NOT NULL,
  "payload" text NOT NULL,
  "state" character varying(16) NOT NULL,
  "attempts" integer NOT NULL,
  "created_at" bigint NOT NULL,
  "available_at" bigint NOT NULL,
  "expires_at" bigint NOT NULL,
  "lease_id" character varying(64) NOT NULL,
  "lease_until" bigint NOT NULL,
  "last_error" character varying(32) NOT NULL,
  CONSTRAINT "mail_jobs_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."unicore_email_challenges" (
  "id" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "purpose" character varying(16) NOT NULL,
  "code_digest" character varying(64) NOT NULL,
  "expires_at" bigint NOT NULL,
  "created_at" bigint NOT NULL,
  "attempts" integer NOT NULL,
  CONSTRAINT "email_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES unicore_users(id),
  CONSTRAINT "email_challenges_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."unicore_external_identities" (
  "identity_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "created_at" bigint NOT NULL,
  CONSTRAINT "external_identities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES unicore_users(id),
  CONSTRAINT "external_identities_pkey" PRIMARY KEY (identity_hash),
  CONSTRAINT "external_identities_user_id_key" UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public."unicore_oidc_flows" (
  "state_hash" character varying(64) NOT NULL,
  "browser_hash" character varying(64) NOT NULL,
  "sealed_payload" text NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "oidc_flows_pkey" PRIMARY KEY (state_hash)
);

CREATE TABLE IF NOT EXISTS public."unicore_storage_locations" (
  "id" character varying(80) NOT NULL,
  "name" character varying(80) NOT NULL,
  "provider" character varying(16) NOT NULL,
  "endpoint" character varying(2048) NOT NULL,
  "bucket" character varying(128) NOT NULL,
  "region" character varying(128) NOT NULL,
  "prefix" character varying(200) NOT NULL,
  "path_style" integer NOT NULL,
  "credentials" text NOT NULL,
  "tested" integer NOT NULL,
  "created_at" bigint NOT NULL,
  CONSTRAINT "storage_locations_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."unicore_file_metadata" (
  "id" character varying(80) NOT NULL,
  "original_name" character varying(255) NOT NULL,
  "storage_type" character varying(16) NOT NULL,
  "location_id" character varying(80) NOT NULL,
  "file_key" character varying(1024) NOT NULL,
  "staging_key" character varying(1024) NOT NULL,
  "mime_type" character varying(160) NOT NULL,
  "size" bigint NOT NULL,
  "etag" character varying(200) NOT NULL,
  "state" character varying(16) NOT NULL,
  "purpose" character varying(16) NOT NULL,
  "creator_id" character varying(80) NOT NULL,
  "creator_realm" character varying(24) NOT NULL,
  "created_at" bigint NOT NULL,
  "expires_at" bigint NOT NULL,
  "upload_expires_at" bigint NOT NULL,
  "cleanup_at" bigint NOT NULL,
  CONSTRAINT "file_metadata_location_id_fkey" FOREIGN KEY (location_id) REFERENCES unicore_storage_locations(id),
  CONSTRAINT "file_metadata_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS file_created ON public.unicore_file_metadata USING btree (purpose, created_at, id);

CREATE INDEX IF NOT EXISTS file_expiry ON public.unicore_file_metadata USING btree (expires_at);

CREATE INDEX IF NOT EXISTS file_location_state ON public.unicore_file_metadata USING btree (location_id, state);

CREATE INDEX IF NOT EXISTS file_owner_created ON public.unicore_file_metadata USING btree (purpose, creator_realm, creator_id, created_at, id);

CREATE INDEX IF NOT EXISTS file_pending_cleanup ON public.unicore_file_metadata USING btree (state, cleanup_at);

CREATE TABLE IF NOT EXISTS public."unicore_file_cleanup_jobs" (
  "id" character varying(80) NOT NULL,
  "location_id" character varying(80) NOT NULL,
  "file_key" character varying(1024) NOT NULL,
  "due_at" bigint NOT NULL,
  "attempts" integer NOT NULL,
  "last_error" character varying(64) NOT NULL,
  CONSTRAINT "file_cleanup_jobs_location_id_fkey" FOREIGN KEY (location_id) REFERENCES unicore_storage_locations(id),
  CONSTRAINT "file_cleanup_jobs_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS file_cleanup_due ON public.unicore_file_cleanup_jobs USING btree (due_at);

CREATE INDEX IF NOT EXISTS file_cleanup_location ON public.unicore_file_cleanup_jobs USING btree (location_id);

CREATE TABLE IF NOT EXISTS public."unicore_audit_metadata" (
  "audit_id" character varying(64) NOT NULL,
  "actor_name" character varying(64) NOT NULL,
  "realm" character varying(32) NOT NULL,
  "target" character varying(256) NOT NULL,
  "detail" character varying(512) NOT NULL,
  "ip_address" character varying(64) NOT NULL,
  CONSTRAINT "audit_metadata_audit_id_fkey" FOREIGN KEY (audit_id) REFERENCES unicore_audit_logs(id),
  CONSTRAINT "audit_metadata_pkey" PRIMARY KEY (audit_id)
);

CREATE TABLE IF NOT EXISTS public."unicore_platform_announcements" (
  "id" character varying(64) NOT NULL,
  "content" text NOT NULL,
  "content_html" text NOT NULL,
  "format" character varying(16) NOT NULL,
  "type" character varying(16) NOT NULL,
  "note" character varying(400) NOT NULL,
  "status" character varying(16) NOT NULL,
  "publish_at" bigint NOT NULL,
  "created_by" character varying(64) NOT NULL,
  "updated_by" character varying(64) NOT NULL,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint NOT NULL DEFAULT 0,
  "version" bigint NOT NULL DEFAULT 1,
  "title" character varying(200) NOT NULL DEFAULT 'Announcement',
  "notify_mode" character varying(16) NOT NULL DEFAULT 'silent',
  "ends_at" bigint NOT NULL DEFAULT 0,
  "audience" character varying(16) NOT NULL DEFAULT 'all',
  CONSTRAINT "platform_announcements_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_announcements_feed ON public.unicore_platform_announcements USING btree (deleted_at, status, publish_at, id);

CREATE TABLE IF NOT EXISTS public."unicore_file_upload_sessions" (
  "file_id" character varying(80) NOT NULL,
  "upload_id" text NOT NULL,
  "fingerprint" character varying(64) NOT NULL,
  "part_size" bigint NOT NULL,
  CONSTRAINT "file_upload_sessions_file_id_fkey" FOREIGN KEY (file_id) REFERENCES unicore_file_metadata(id),
  CONSTRAINT "file_upload_sessions_pkey" PRIMARY KEY (file_id)
);

CREATE TABLE IF NOT EXISTS public."unicore_announcement_recipients" (
  "announcement_id" character varying(64) NOT NULL REFERENCES public."unicore_platform_announcements"(id) ON DELETE CASCADE,
  "user_id" character varying(64) NOT NULL REFERENCES public."unicore_users"(id) ON DELETE CASCADE,
  CONSTRAINT "unicore_announcement_recipients_pkey" PRIMARY KEY (announcement_id, user_id)
);
CREATE TABLE IF NOT EXISTS public."unicore_announcement_reads" (
  "announcement_id" character varying(64) NOT NULL REFERENCES public."unicore_platform_announcements"(id) ON DELETE CASCADE,
  "user_id" character varying(64) NOT NULL REFERENCES public."unicore_users"(id) ON DELETE CASCADE,
  "read_at" bigint NOT NULL,
  CONSTRAINT "unicore_announcement_reads_pkey" PRIMARY KEY (announcement_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_users_phone_key ON public.unicore_users USING btree (phone);

CREATE TABLE IF NOT EXISTS unicore_personal_accounts (
 user_id VARCHAR(64) NOT NULL PRIMARY KEY REFERENCES unicore_users(id),
 display_name VARCHAR(80) NOT NULL, totp_secret TEXT NOT NULL, recovery_digests TEXT NOT NULL,
 last_step BIGINT NOT NULL, setup_secret TEXT NOT NULL, setup_session VARCHAR(64) NOT NULL, setup_expires BIGINT NOT NULL, setup_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_session_details (
 token_hash VARCHAR(64) NOT NULL PRIMARY KEY REFERENCES unicore_sessions(token_hash) ON DELETE CASCADE,
 user_id VARCHAR(64) NOT NULL REFERENCES unicore_users(id),
 ip_address VARCHAR(64) NOT NULL, user_agent VARCHAR(512) NOT NULL,
 created_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL, mfa_verified INTEGER NOT NULL, mfa_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_email_changes (
 id VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES unicore_users(id),
 session_hash VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL,
 original_email VARCHAR(254) NOT NULL, target_email VARCHAR(254) NOT NULL,
 code_digest VARCHAR(64) NOT NULL, verified INTEGER NOT NULL, attempts INTEGER NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
);

INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'legacy-brand','历史品牌文件','local','','','','',1,'',1,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='legacy-brand');

INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'local','本地存储','local','','','','',1,'',1,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='local');

CREATE TABLE IF NOT EXISTS public."unicore_menus" (
  "menu_key" character varying(64) NOT NULL,
  "label" character varying(80) NOT NULL DEFAULT '',
  "group_key" character varying(32) NOT NULL DEFAULT '',
  "sort" integer NOT NULL DEFAULT 100,
  "visible" bigint NOT NULL DEFAULT 1,
  "updated_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_menus_pkey" PRIMARY KEY (menu_key),
 parent_key VARCHAR(64) NULL,
 type VARCHAR(16) NOT NULL DEFAULT 'page',
 url VARCHAR(2048) NULL
);
CREATE TABLE IF NOT EXISTS public."unicore_dict_types" (
  "id" character varying(64) NOT NULL,
  "code" character varying(64) NOT NULL,
  "name" character varying(80) NOT NULL,
  "description" character varying(200) NOT NULL DEFAULT '',
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  CONSTRAINT "unicore_dict_types_pkey" PRIMARY KEY (id),
  CONSTRAINT "unicore_dict_types_code_key" UNIQUE (code)
);
CREATE TABLE IF NOT EXISTS public."unicore_dict_items" (
  "id" character varying(64) NOT NULL,
  "type_code" character varying(64) NOT NULL REFERENCES public."unicore_dict_types"(code) ON DELETE CASCADE,
  "value" character varying(128) NOT NULL,
  "label" character varying(80) NOT NULL,
  "remark" character varying(200) NOT NULL DEFAULT '',
  "sort" integer NOT NULL DEFAULT 0,
  "status" character varying(16) NOT NULL DEFAULT 'active',
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  CONSTRAINT "unicore_dict_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "unicore_dict_items_type_value_key" UNIQUE (type_code, value)
);
CREATE INDEX IF NOT EXISTS unicore_dict_items_type_sort ON public.unicore_dict_items USING btree (type_code, sort);

CREATE TABLE IF NOT EXISTS public."unicore_inbox_messages" (
  "id" character varying(64) NOT NULL,
  "recipient_id" character varying(64) NOT NULL,
  "type" character varying(32) NOT NULL,
  "source_id" character varying(64) NOT NULL DEFAULT '',
  "title" character varying(200) NOT NULL,
  "body" text NOT NULL,
  "created_at" bigint NOT NULL,
  "read_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_inbox_messages_pkey" PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS unicore_inbox_recipient ON public.unicore_inbox_messages USING btree (recipient_id, read_at, created_at);
CREATE TABLE IF NOT EXISTS public."unicore_scheduled_jobs" (
  "name" character varying(64) NOT NULL,
  "schedule" varchar(64) NOT NULL,
  "enabled" bigint NOT NULL DEFAULT 1,
  "last_run_at" bigint NOT NULL DEFAULT 0,
  "last_status" character varying(16) NOT NULL DEFAULT '',
  "last_error" character varying(200) NOT NULL DEFAULT '',
  "run_count" bigint NOT NULL DEFAULT 0,
  "next_run_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_scheduled_jobs_pkey" PRIMARY KEY (name),
 description VARCHAR(200) NOT NULL DEFAULT '',
 executor VARCHAR(64) NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS public."unicore_account_avatars" (
  "user_id" character varying(64) NOT NULL,
  "creator_realm" character varying(16) NOT NULL,
  "file_id" character varying(80) NOT NULL DEFAULT '',
  "updated_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_account_avatars_pkey" PRIMARY KEY (user_id,creator_realm)
);

CREATE TABLE IF NOT EXISTS public."unicore_departments" (id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NULL, sort INT NOT NULL DEFAULT 0, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL);

CREATE INDEX IF NOT EXISTS unicore_departments_parent_id_idx ON public."unicore_departments"(parent_id);

CREATE UNIQUE INDEX IF NOT EXISTS unicore_departments_sibling_name ON public."unicore_departments"(name, COALESCE(parent_id, ''));

CREATE TABLE IF NOT EXISTS public."unicore_role_departments" (role_id VARCHAR(64) NOT NULL, department_id VARCHAR(64) NOT NULL, PRIMARY KEY (role_id, department_id));

CREATE TABLE IF NOT EXISTS unicore_navigation_state (id INTEGER PRIMARY KEY, version BIGINT NOT NULL, initialized INTEGER NOT NULL);
INSERT INTO unicore_navigation_state(id,version,initialized) SELECT 1,0,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_navigation_state WHERE id=1);
CREATE TABLE IF NOT EXISTS unicore_navigation_sections (id VARCHAR(64) PRIMARY KEY, surface VARCHAR(32) NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS unicore_navigation_nodes (id VARCHAR(64) NOT NULL, section_id VARCHAR(64) NOT NULL, node_type VARCHAR(16) NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(section_id, id));
CREATE TABLE IF NOT EXISTS unicore_role_authorizations (role_id VARCHAR(64) PRIMARY KEY, initialized INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS unicore_role_menus (role_id VARCHAR(64) NOT NULL, menu_id VARCHAR(64) NOT NULL, PRIMARY KEY(role_id,menu_id));
CREATE TABLE IF NOT EXISTS unicore_role_actions (role_id VARCHAR(64) NOT NULL, action_id VARCHAR(64) NOT NULL, PRIMARY KEY(role_id,action_id));
CREATE TABLE IF NOT EXISTS unicore_role_operations (role_id VARCHAR(64) NOT NULL, operation_id VARCHAR(128) NOT NULL, PRIMARY KEY(role_id,operation_id));

CREATE TABLE IF NOT EXISTS public.unicore_posts (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    description VARCHAR(500) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS unicore_posts_sort_idx ON public.unicore_posts(sort, code, id);
CREATE TABLE IF NOT EXISTS public.unicore_user_posts (
    user_id VARCHAR(64) NOT NULL,
    post_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, post_id),
    CONSTRAINT unicore_user_posts_user_fk FOREIGN KEY (user_id) REFERENCES public.unicore_users(id) ON DELETE CASCADE,
    CONSTRAINT unicore_user_posts_post_fk FOREIGN KEY (post_id) REFERENCES public.unicore_posts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS unicore_user_posts_post_idx ON public.unicore_user_posts(post_id, user_id);

CREATE TABLE IF NOT EXISTS public."unicore_task_runs" (
  "id" character varying(64) NOT NULL,
  "job_name" character varying(64) NOT NULL,
  "started_at" bigint NOT NULL,
  "duration_ms" bigint NOT NULL DEFAULT 0,
  "status" character varying(16) NOT NULL,
  "error" character varying(200) NOT NULL DEFAULT '',
  CONSTRAINT "unicore_task_runs_pkey" PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS unicore_task_runs_job ON public.unicore_task_runs USING btree (job_name, started_at);

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
