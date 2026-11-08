-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: fresh-install role workspace classification; accounts and memberships are unified.
-- Profile: web-platform only. realm is presentation metadata, not an authorization boundary.
-- Compatibility: unreleased fresh installations only; no dual-account database upgrade.
-- Recovery: discard only an explicitly owned test database or restore a matching full snapshot.
ALTER TABLE `unicore_roles` ADD COLUMN `realm` VARCHAR(16) NOT NULL DEFAULT 'user';
UPDATE `unicore_roles` SET `realm`='administrator' WHERE `id`='super_admin' AND `realm`<>'administrator';
