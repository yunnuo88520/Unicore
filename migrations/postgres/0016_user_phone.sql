-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: web-platform registration phone binding; one nullable phone per account.
-- Compatibility: existing accounts keep phone empty and keep working; NULL never collides in the unique index.
-- Administrators gain the same nullable column for schema parity with the shared account code; it stays unused there.
-- Recovery: stop writes and restore a matching database backup after partial DDL; drop the columns and indexes to roll back.
ALTER TABLE unicore_users ADD COLUMN phone VARCHAR(21);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_users_phone_key ON unicore_users(phone);
ALTER TABLE unicore_administrators ADD COLUMN phone VARCHAR(21);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_administrators_phone_key ON unicore_administrators(phone);
