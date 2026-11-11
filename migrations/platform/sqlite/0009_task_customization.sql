-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 9: administrator-created scheduled tasks and bounded run history.
-- Profile: web-platform only.
-- Compatibility: unicore_scheduled_jobs gains description/executor (empty executor marks builtin rows seeded by
--  the Go scheduler); new additive unicore_task_runs table stores the last 50 runs per custom task, trimmed by code.
--  Existing builtin rows keep their schedule and enablement.
-- Recovery: SQLite runs transactional DDL, so an interrupted run rolls back completely; restore a matching database
--  backup after partial DDL. No down SQL.
ALTER TABLE unicore_scheduled_jobs ADD COLUMN description VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE unicore_scheduled_jobs ADD COLUMN executor VARCHAR(64) NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS unicore_task_runs (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 job_name VARCHAR(64) NOT NULL,
 started_at BIGINT NOT NULL,
 duration_ms BIGINT NOT NULL DEFAULT 0,
 status VARCHAR(16) NOT NULL,
 error VARCHAR(200) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS unicore_task_runs_job ON unicore_task_runs(job_name,started_at);
