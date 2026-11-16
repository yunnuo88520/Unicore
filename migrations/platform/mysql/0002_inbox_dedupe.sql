-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: dedupe delivered inbox copies and enforce one message per (recipient, type, source); mysql; web-platform and web-standalone.
-- Compatibility: appended after platform@1; existing platform@1 ledgers keep their checksums and advance in place on the next start.
-- Recovery: the ALTER below is one statement and MySQL commits it implicitly; if it lands without a ledger row, restore matching snapshots to a new target instead of retrying or hand-editing the ledger. No down SQL.
-- MySQL has no partial index: a stored generated key folds empty-source system messages onto their own id, so only real duplicates share a key.
-- Duplicates keep the oldest copy (smallest created_at, then id); rerunning the DELETE removes nothing new.

DELETE m1 FROM unicore_inbox_messages m1
JOIN unicore_inbox_messages m2
  ON m1.recipient_id = m2.recipient_id
 AND m1.type = m2.type
 AND m1.source_id = m2.source_id
WHERE m1.source_id <> ''
  AND m2.source_id <> ''
  AND (m1.created_at > m2.created_at
       OR (m1.created_at = m2.created_at AND m1.id > m2.id));

ALTER TABLE unicore_inbox_messages
  ADD COLUMN dedup_key VARCHAR(200)
    GENERATED ALWAYS AS (CASE WHEN source_id <> '' THEN CONCAT(recipient_id, '|', type, '|', source_id) ELSE id END) STORED,
  ADD UNIQUE KEY unicore_inbox_source_key (dedup_key);
