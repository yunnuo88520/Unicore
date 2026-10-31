-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: additive soft deletion for the notes example; existing rows remain active.
-- Recovery: restore matching pre-upgrade DB and data backup before reverting code.
ALTER TABLE example_notes ADD COLUMN deleted_at BIGINT NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_notes_active ON example_notes(scope_key,deleted_at,updated_at);
