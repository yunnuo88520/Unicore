-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: drop the retired legacy authorization tables; postgres; web-platform and web-standalone.
-- Compatibility: appended after platform@2; applied platform@1/@2 ledgers keep their checksums and advance in place on the next start.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.
-- The two tables were retired with the explicit-authorization baseline (ADR-0050):
-- unicore_role_authorizations was a one-time materialization cache and unicore_menus
-- the pre-navigation menu store. No code reads or writes either table any more;
-- the data they held is derived state, so dropping loses nothing.
-- Rerunning this file removes nothing new.

DROP TABLE IF EXISTS unicore_role_authorizations;
DROP TABLE IF EXISTS unicore_menus;
