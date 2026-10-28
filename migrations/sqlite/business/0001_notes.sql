-- Author: yunnuo <ymz@ebox.vip>
-- Additive business example; restore the complete pre-upgrade backup to roll back schema and data together.
CREATE TABLE IF NOT EXISTS example_notes (
 scope_key VARCHAR(96) NOT NULL,
 id VARCHAR(64) NOT NULL,
 title VARCHAR(120) NOT NULL,
 body TEXT NOT NULL,
 status VARCHAR(16) NOT NULL,
 attachment_ids TEXT NOT NULL,
 version INTEGER NOT NULL,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 PRIMARY KEY(scope_key,id)
);
CREATE INDEX IF NOT EXISTS example_notes_owner_updated ON example_notes(scope_key,updated_at,id);
