-- Author: yunnuo <ymz@ebox.vip>
-- Idempotent MySQL DDL; never change a recorded checksum. Roll back using a full pre-upgrade backup.
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
 PRIMARY KEY(scope_key,id),
 INDEX example_notes_owner_updated(scope_key,updated_at,id)
);
