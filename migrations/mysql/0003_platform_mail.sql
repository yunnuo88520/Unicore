-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: M2b platform email tokens and persistent encrypted delivery queue (mysql).
-- Compatibility: additive tables only; M2a data and migration checksums are retained.
-- Rollback: stop delivery and restore a native database backup; never drop populated tables automatically.
CREATE TABLE IF NOT EXISTS account_tokens (token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL, purpose VARCHAR(16) NOT NULL, expires_at BIGINT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS mail_jobs (id VARCHAR(64) PRIMARY KEY, token_hash VARCHAR(64) NOT NULL, payload TEXT NOT NULL, state VARCHAR(16) NOT NULL, attempts INTEGER NOT NULL, created_at BIGINT NOT NULL, available_at BIGINT NOT NULL, expires_at BIGINT NOT NULL, lease_id VARCHAR(64) NOT NULL, lease_until BIGINT NOT NULL, last_error VARCHAR(32) NOT NULL);
