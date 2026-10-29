-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform announcement aggregates; additive, old binaries ignore the new table.
-- Recovery: stop service and restore matching database/data backup; never change prior checksums.
CREATE TABLE IF NOT EXISTS platform_announcements (
 id VARCHAR(64) PRIMARY KEY,
 content TEXT NOT NULL,
 content_html TEXT NOT NULL,
 format VARCHAR(16) NOT NULL,
 type VARCHAR(16) NOT NULL,
 note VARCHAR(400) NOT NULL,
 status VARCHAR(16) NOT NULL,
 publish_at BIGINT NOT NULL,
 created_by VARCHAR(64) NOT NULL,
 updated_by VARCHAR(64) NOT NULL,
 created_at BIGINT NOT NULL,
 updated_at BIGINT NOT NULL,
 deleted_at BIGINT NOT NULL DEFAULT 0,
 version BIGINT NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_announcements_feed ON platform_announcements(deleted_at,status,publish_at,id);
