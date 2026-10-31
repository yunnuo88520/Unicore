-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: module.notes version 1 final-state baseline; sqlite; web-platform, web-standalone, desktop.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.
-- Text/composite primary keys reject NULL; INTEGER PRIMARY KEY retains rowid allocation.

CREATE TABLE example_notes (
 scope_key VARCHAR(96) NOT NULL,
 id VARCHAR(64) NOT NULL,
 title VARCHAR(120) NOT NULL,
 body TEXT NOT NULL,
 status VARCHAR(16) NOT NULL,
 attachment_ids TEXT NOT NULL,
 version INTEGER NOT NULL,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL, deleted_at BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(scope_key,id)
);

CREATE INDEX idx_notes_active ON example_notes(scope_key,deleted_at,updated_at);

CREATE INDEX example_notes_owner_updated ON example_notes(scope_key,updated_at,id);
