-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform@4 adds the role editor compare-and-swap version (mysql).
-- Profiles: existing platform namespace members web-platform, web-standalone and desktop;
-- the shared column does not expose platform governance in Standalone.
-- Compatibility: additive positive version, existing and newly inserted roles start at 1.
-- Recovery: restore a matching pre-upgrade snapshot to a new target; do not edit the ledger.
-- MySQL DDL may commit before ledger registration: inspect the schema and restore on failure.

ALTER TABLE unicore_roles ADD COLUMN version BIGINT NOT NULL DEFAULT 1;
