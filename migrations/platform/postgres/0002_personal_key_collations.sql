-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Record the cross-dialect personal-security key compatibility version; PostgreSQL needs no schema change.
-- Profiles: web-platform and web-standalone; desktop uses the SQLite counterpart.
-- Compatibility: Append to platform@1 and preserve all data and comparison semantics.
-- Recovery: Restore the matching pre-upgrade snapshot with its binary to a new empty target; no down SQL.
SELECT 1;
