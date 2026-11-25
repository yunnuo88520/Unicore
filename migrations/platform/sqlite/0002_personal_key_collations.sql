-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Record the cross-dialect personal-security key compatibility version; SQLite needs no schema change.
-- Profiles: web-platform, web-standalone and desktop.
-- Compatibility: Append to platform@1 and preserve all data and comparison semantics.
-- Recovery: Restore the matching pre-upgrade snapshot with its binary to a new data directory; no down SQL.
SELECT 1;
