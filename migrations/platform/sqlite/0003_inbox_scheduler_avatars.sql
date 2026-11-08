-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 3: personal inbox messages, scheduled job registry and account avatars.
-- Profile: web-platform only.
-- Compatibility: additive empty tables; the scheduler seeds its builtin rows at startup.
-- Recovery: SQLite/PostgreSQL transactional DDL; restore matching DB/data/binary snapshots to a new target. No down SQL.
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
 next_run_at BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS unicore_account_avatars (
 user_id VARCHAR(64) NOT NULL,
 creator_realm VARCHAR(16) NOT NULL,
 file_id VARCHAR(80) NOT NULL DEFAULT '',
 updated_at BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,creator_realm)
);
