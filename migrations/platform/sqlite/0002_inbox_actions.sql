-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform 2 adds the notification actions payload (module-delivered buttons); sqlite; web-platform only today.
-- Compatibility: additive column with empty default; pre-stable squash registry accepts the extended baseline.

ALTER TABLE unicore_inbox_messages ADD COLUMN actions TEXT NOT NULL DEFAULT '';
