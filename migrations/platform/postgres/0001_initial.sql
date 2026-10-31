-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 1 final-state baseline; postgres; web-platform only.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.

CREATE TABLE public."roles" (
  "id" character varying(64) NOT NULL,
  "name" character varying(64) NOT NULL,
  CONSTRAINT "roles_pkey" PRIMARY KEY (id),
  CONSTRAINT "roles_name_key" UNIQUE (name)
);

CREATE TABLE public."permissions" (
  "id" character varying(128) NOT NULL,
  CONSTRAINT "permissions_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."users" (
  "id" character varying(64) NOT NULL,
  "username" character varying(64) NOT NULL,
  "email" character varying(254) NOT NULL,
  "password_hash" text NOT NULL,
  "status" character varying(16) NOT NULL,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "last_login_at" bigint NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY (id),
  CONSTRAINT "users_email_key" UNIQUE (email),
  CONSTRAINT "users_username_key" UNIQUE (username)
);

CREATE TABLE public."administrators" (
  "id" character varying(64) NOT NULL,
  "username" character varying(64) NOT NULL,
  "email" character varying(254) NOT NULL,
  "password_hash" text NOT NULL,
  "status" character varying(16) NOT NULL,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "last_login_at" bigint NOT NULL,
  CONSTRAINT "administrators_pkey" PRIMARY KEY (id),
  CONSTRAINT "administrators_email_key" UNIQUE (email),
  CONSTRAINT "administrators_username_key" UNIQUE (username)
);

CREATE TABLE public."user_roles" (
  "user_id" character varying(64) NOT NULL,
  "role_id" character varying(64) NOT NULL,
  CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT "user_roles_pkey" PRIMARY KEY (user_id, role_id)
);

CREATE TABLE public."role_permissions" (
  "role_id" character varying(64) NOT NULL,
  "permission_id" character varying(128) NOT NULL,
  CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES permissions(id),
  CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT "role_permissions_pkey" PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public."sessions" (
  "token_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT "sessions_pkey" PRIMARY KEY (token_hash)
);

CREATE TABLE public."account_tokens" (
  "token_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "purpose" character varying(16) NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "account_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT "account_tokens_pkey" PRIMARY KEY (token_hash)
);

CREATE TABLE public."mail_jobs" (
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

CREATE TABLE public."email_challenges" (
  "id" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "purpose" character varying(16) NOT NULL,
  "code_digest" character varying(64) NOT NULL,
  "expires_at" bigint NOT NULL,
  "created_at" bigint NOT NULL,
  "attempts" integer NOT NULL,
  CONSTRAINT "email_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT "email_challenges_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."external_identities" (
  "identity_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "created_at" bigint NOT NULL,
  CONSTRAINT "external_identities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT "external_identities_pkey" PRIMARY KEY (identity_hash),
  CONSTRAINT "external_identities_user_id_key" UNIQUE (user_id)
);

CREATE TABLE public."oidc_flows" (
  "state_hash" character varying(64) NOT NULL,
  "browser_hash" character varying(64) NOT NULL,
  "sealed_payload" text NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "oidc_flows_pkey" PRIMARY KEY (state_hash)
);

CREATE TABLE public."administrator_roles" (
  "user_id" character varying(64) NOT NULL,
  "role_id" character varying(64) NOT NULL,
  CONSTRAINT "administrator_roles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT "administrator_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES administrators(id),
  CONSTRAINT "administrator_roles_pkey" PRIMARY KEY (user_id, role_id)
);

CREATE TABLE public."administrator_sessions" (
  "token_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "administrator_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES administrators(id),
  CONSTRAINT "administrator_sessions_pkey" PRIMARY KEY (token_hash)
);

CREATE TABLE public."administrator_account_tokens" (
  "token_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "purpose" character varying(16) NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "administrator_account_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES administrators(id),
  CONSTRAINT "administrator_account_tokens_pkey" PRIMARY KEY (token_hash)
);

CREATE TABLE public."administrator_email_challenges" (
  "id" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "purpose" character varying(16) NOT NULL,
  "code_digest" character varying(64) NOT NULL,
  "expires_at" bigint NOT NULL,
  "created_at" bigint NOT NULL,
  "attempts" integer NOT NULL,
  CONSTRAINT "administrator_email_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES administrators(id),
  CONSTRAINT "administrator_email_challenges_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."administrator_external_identities" (
  "identity_hash" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "created_at" bigint NOT NULL,
  CONSTRAINT "administrator_external_identities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES administrators(id),
  CONSTRAINT "administrator_external_identities_pkey" PRIMARY KEY (identity_hash),
  CONSTRAINT "administrator_external_identities_user_id_key" UNIQUE (user_id)
);

CREATE TABLE public."administrator_oidc_flows" (
  "state_hash" character varying(64) NOT NULL,
  "browser_hash" character varying(64) NOT NULL,
  "sealed_payload" text NOT NULL,
  "expires_at" bigint NOT NULL,
  CONSTRAINT "administrator_oidc_flows_pkey" PRIMARY KEY (state_hash)
);

CREATE TABLE public."storage_locations" (
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

CREATE TABLE public."file_metadata" (
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
  CONSTRAINT "file_metadata_location_id_fkey" FOREIGN KEY (location_id) REFERENCES storage_locations(id),
  CONSTRAINT "file_metadata_pkey" PRIMARY KEY (id)
);

CREATE INDEX file_created ON public.file_metadata USING btree (purpose, created_at, id);

CREATE INDEX file_expiry ON public.file_metadata USING btree (expires_at);

CREATE INDEX file_location_state ON public.file_metadata USING btree (location_id, state);

CREATE INDEX file_owner_created ON public.file_metadata USING btree (purpose, creator_realm, creator_id, created_at, id);

CREATE INDEX file_pending_cleanup ON public.file_metadata USING btree (state, cleanup_at);

CREATE TABLE public."file_cleanup_jobs" (
  "id" character varying(80) NOT NULL,
  "location_id" character varying(80) NOT NULL,
  "file_key" character varying(1024) NOT NULL,
  "due_at" bigint NOT NULL,
  "attempts" integer NOT NULL,
  "last_error" character varying(64) NOT NULL,
  CONSTRAINT "file_cleanup_jobs_location_id_fkey" FOREIGN KEY (location_id) REFERENCES storage_locations(id),
  CONSTRAINT "file_cleanup_jobs_pkey" PRIMARY KEY (id)
);

CREATE INDEX file_cleanup_due ON public.file_cleanup_jobs USING btree (due_at);

CREATE INDEX file_cleanup_location ON public.file_cleanup_jobs USING btree (location_id);

CREATE TABLE public."audit_metadata" (
  "audit_id" character varying(64) NOT NULL,
  "actor_name" character varying(64) NOT NULL,
  "realm" character varying(32) NOT NULL,
  "target" character varying(256) NOT NULL,
  "detail" character varying(512) NOT NULL,
  "ip_address" character varying(64) NOT NULL,
  CONSTRAINT "audit_metadata_audit_id_fkey" FOREIGN KEY (audit_id) REFERENCES audit_logs(id),
  CONSTRAINT "audit_metadata_pkey" PRIMARY KEY (audit_id)
);

CREATE TABLE public."platform_announcements" (
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
  CONSTRAINT "platform_announcements_pkey" PRIMARY KEY (id)
);

CREATE INDEX idx_announcements_feed ON public.platform_announcements USING btree (deleted_at, status, publish_at, id);

CREATE TABLE public."file_upload_sessions" (
  "file_id" character varying(80) NOT NULL,
  "upload_id" text NOT NULL,
  "fingerprint" character varying(64) NOT NULL,
  "part_size" bigint NOT NULL,
  CONSTRAINT "file_upload_sessions_file_id_fkey" FOREIGN KEY (file_id) REFERENCES file_metadata(id),
  CONSTRAINT "file_upload_sessions_pkey" PRIMARY KEY (file_id)
);

INSERT INTO storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) VALUES('legacy-brand','历史品牌文件','local','','','','',1,'',1,0);

INSERT INTO storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) VALUES('local','本地存储','local','','','','',1,'',1,0);
