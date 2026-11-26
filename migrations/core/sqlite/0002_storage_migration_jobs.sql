-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Durable storage migration jobs and per-file failure records behind the platform file governance.
-- Profiles: web-platform, web-standalone and desktop; only web-platform runs migration workers.
-- Compatibility: Append to core@1; new tables only, no change to existing rows or semantics. No foreign keys so job history outlives location removal.
-- Recovery: Restore the matching pre-upgrade snapshot with its binary to a new data directory; no down SQL.

CREATE TABLE IF NOT EXISTS unicore_storage_migration_jobs (
 id VARCHAR(80) NOT NULL PRIMARY KEY, source_location_id VARCHAR(80) NOT NULL,
 target_location_id VARCHAR(80) NOT NULL, status VARCHAR(16) NOT NULL, mode VARCHAR(16) NOT NULL,
 activate_on_complete INTEGER NOT NULL, total_count BIGINT NOT NULL,
 succeeded_count BIGINT NOT NULL, failed_count BIGINT NOT NULL,
 scan_cursor VARCHAR(80) NOT NULL, created_by VARCHAR(80) NOT NULL,
 created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, finished_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS migration_job_status ON unicore_storage_migration_jobs(status);

CREATE TABLE IF NOT EXISTS unicore_storage_migration_failures (
 job_id VARCHAR(80) NOT NULL, file_id VARCHAR(80) NOT NULL,
 original_name VARCHAR(255) NOT NULL, reason VARCHAR(64) NOT NULL,
 created_at BIGINT NOT NULL, PRIMARY KEY (job_id, file_id)
);
