-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: core version 1 final-state baseline; postgres; web-platform, web-standalone.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.

CREATE TABLE IF NOT EXISTS public."unicore_install_state" (
  "id" integer NOT NULL,
  "profile" character varying(32) NOT NULL,
  "instance_id" character varying(64) NOT NULL,
  "installed_at" bigint NOT NULL,
  CONSTRAINT "install_state_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."unicore_system_settings" (
  "setting_key" character varying(128) NOT NULL,
  "setting_value" text NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY (setting_key)
);

CREATE TABLE IF NOT EXISTS public."unicore_audit_logs" (
  "id" character varying(64) NOT NULL,
  "actor_id" character varying(64) NOT NULL,
  "action" character varying(128) NOT NULL,
  "created_at" bigint NOT NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id)
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

CREATE TABLE IF NOT EXISTS public."unicore_file_upload_sessions" (
  "file_id" character varying(80) NOT NULL,
  "upload_id" text NOT NULL,
  "fingerprint" character varying(64) NOT NULL,
  "part_size" bigint NOT NULL,
  CONSTRAINT "file_upload_sessions_file_id_fkey" FOREIGN KEY (file_id) REFERENCES unicore_file_metadata(id),
  CONSTRAINT "file_upload_sessions_pkey" PRIMARY KEY (file_id)
);

INSERT INTO unicore_storage_locations(id,name,provider,endpoint,bucket,region,prefix,path_style,credentials,tested,created_at) SELECT 'local','本地存储','local','','','','',1,'',1,0 WHERE NOT EXISTS (SELECT 1 FROM unicore_storage_locations WHERE id='local');
