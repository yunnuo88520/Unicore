-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 3: personal inbox messages, scheduled job registry and account avatars.
-- Profile: web-platform only.
-- Compatibility: additive empty tables; the scheduler seeds its builtin rows at startup.
-- Recovery: SQLite/PostgreSQL transactional DDL; restore matching DB/data/binary snapshots to a new target. No down SQL.
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
  CONSTRAINT "unicore_scheduled_jobs_pkey" PRIMARY KEY (name)
);
CREATE TABLE IF NOT EXISTS public."unicore_account_avatars" (
  "user_id" character varying(64) NOT NULL,
  "creator_realm" character varying(16) NOT NULL,
  "file_id" character varying(80) NOT NULL DEFAULT '',
  "updated_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_account_avatars_pkey" PRIMARY KEY (user_id,creator_realm)
);
