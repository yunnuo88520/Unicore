-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: web-platform announcement notifications, recipients and first-read receipts.
-- Compatibility: existing announcements retain publication and become silent, all-user notifications.
-- Recovery: stop writes and restore matching database/data backup after partial DDL (especially MySQL).
ALTER TABLE unicore_platform_announcements ADD COLUMN title VARCHAR(200) NOT NULL DEFAULT 'Announcement';
ALTER TABLE unicore_platform_announcements ADD COLUMN notify_mode VARCHAR(16) NOT NULL DEFAULT 'silent';
ALTER TABLE unicore_platform_announcements ADD COLUMN ends_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE unicore_platform_announcements ADD COLUMN audience VARCHAR(16) NOT NULL DEFAULT 'all';
CREATE TABLE IF NOT EXISTS unicore_announcement_recipients (
 announcement_id VARCHAR(64) NOT NULL REFERENCES unicore_platform_announcements(id) ON DELETE CASCADE,
 user_id VARCHAR(64) NOT NULL REFERENCES unicore_users(id) ON DELETE CASCADE,
 PRIMARY KEY (announcement_id,user_id)
);
CREATE TABLE IF NOT EXISTS unicore_announcement_reads (
 announcement_id VARCHAR(64) NOT NULL REFERENCES unicore_platform_announcements(id) ON DELETE CASCADE,
 user_id VARCHAR(64) NOT NULL REFERENCES unicore_users(id) ON DELETE CASCADE,
 read_at BIGINT NOT NULL,
 PRIMARY KEY (announcement_id,user_id)
);
