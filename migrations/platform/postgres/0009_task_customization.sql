-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 9: administrator-created scheduled tasks and bounded run history.
-- Profile: web-platform only.
-- Compatibility: unicore_scheduled_jobs gains description/executor (empty executor marks builtin rows seeded by
--  the Go scheduler); new additive unicore_task_runs table stores the last 50 runs per custom task, trimmed by code.
--  Existing builtin rows keep their schedule and enablement.
-- Recovery: PostgreSQL runs transactional DDL, so an interrupted run rolls back completely; restore a matching
--  database backup after partial DDL. No down SQL.
ALTER TABLE public."unicore_scheduled_jobs" ADD COLUMN description VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE public."unicore_scheduled_jobs" ADD COLUMN executor VARCHAR(64) NOT NULL DEFAULT '';
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
