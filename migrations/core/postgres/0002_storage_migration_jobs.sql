-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Durable storage migration jobs and per-file failure records behind the platform file governance.
-- Profiles: web-platform, web-standalone and desktop; only web-platform runs migration workers.
-- Compatibility: Append to core@1; new tables only, no change to existing rows or semantics. No foreign keys so job history outlives location removal.
-- Recovery: Restore the matching pre-upgrade snapshot with its binary to a new data directory; no down SQL.

CREATE TABLE IF NOT EXISTS public."unicore_storage_migration_jobs" (
  "id" character varying(80) NOT NULL,
  "source_location_id" character varying(80) NOT NULL,
  "target_location_id" character varying(80) NOT NULL,
  "status" character varying(16) NOT NULL,
  "mode" character varying(16) NOT NULL,
  "activate_on_complete" integer NOT NULL,
  "total_count" bigint NOT NULL,
  "succeeded_count" bigint NOT NULL,
  "failed_count" bigint NOT NULL,
  "scan_cursor" character varying(80) NOT NULL,
  "created_by" character varying(80) NOT NULL,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "finished_at" bigint NOT NULL,
  CONSTRAINT "storage_migration_jobs_pkey" PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS migration_job_status ON public.unicore_storage_migration_jobs USING btree (status);

CREATE TABLE IF NOT EXISTS public."unicore_storage_migration_failures" (
  "job_id" character varying(80) NOT NULL,
  "file_id" character varying(80) NOT NULL,
  "original_name" character varying(255) NOT NULL,
  "reason" character varying(64) NOT NULL,
  "created_at" bigint NOT NULL,
  CONSTRAINT "storage_migration_failures_pkey" PRIMARY KEY (job_id, file_id)
);
