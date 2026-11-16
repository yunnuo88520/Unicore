-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: dedupe delivered inbox copies and enforce one message per (recipient, type, source); postgres; web-platform and web-standalone.
-- Compatibility: appended after platform@1; existing platform@1 ledgers keep their checksums and advance in place on the next start.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.
-- Empty source_id marks independent system messages and stays outside the key via a partial unique index.
-- Duplicates keep the oldest copy (smallest created_at, then id); rerunning this file removes nothing new.

DELETE FROM unicore_inbox_messages AS m
USING unicore_inbox_messages AS b
WHERE m.source_id <> ''
  AND b.source_id <> ''
  AND b.recipient_id = m.recipient_id
  AND b.type = m.type
  AND b.source_id = m.source_id
  AND (b.created_at, b.id) < (m.created_at, m.id);

CREATE UNIQUE INDEX IF NOT EXISTS unicore_inbox_source_key
  ON unicore_inbox_messages(recipient_id, type, source_id) WHERE source_id <> '';
