-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform 2 adds the notification actions payload (module-delivered buttons); mysql; web-platform only today.
-- Compatibility: additive column; MySQL forbids DEFAULT on TEXT, existing rows take the implicit empty string. Pre-stable squash registry accepts the extended baseline.

ALTER TABLE unicore_inbox_messages ADD COLUMN actions TEXT NOT NULL;
