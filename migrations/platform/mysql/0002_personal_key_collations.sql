-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Align personal-security association keys with the referenced account, session and mail keys.
-- Profiles: web-platform and web-standalone; desktop uses the SQLite counterpart.
-- Compatibility: Append to platform@1 without changing names, content, login-email comparisons or the frozen baseline.
-- Recovery: Stop on failure; MySQL DDL may commit before the ledger. Restore the matching pre-upgrade snapshot to a new empty target.

ALTER TABLE unicore_personal_accounts
  MODIFY user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE unicore_session_details
  MODIFY token_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  MODIFY user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE unicore_email_changes
  MODIFY id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  MODIFY user_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  MODIFY session_hash VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  MODIFY parent_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;
