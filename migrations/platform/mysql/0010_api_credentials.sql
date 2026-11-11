-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform API credentials, refresh replay tombstones and JWT signing keys.
-- Compatibility: append-only platform@9 -> platform@10; no existing data rewrite.
-- Recovery: restore a matching pre-upgrade snapshot; do not remove ledger rows.
-- Session anchors are checked by JOIN on every use (also on SQLite without FKs).
CREATE TABLE IF NOT EXISTS unicore_api_credentials (
 id VARCHAR(64) NOT NULL PRIMARY KEY, user_id VARCHAR(64) NOT NULL,
 kind VARCHAR(16) NOT NULL, name VARCHAR(80) NOT NULL,
 session_hash VARCHAR(64) NOT NULL UNIQUE, session_secret TEXT NOT NULL,
 operations TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
 last_used_at BIGINT NOT NULL, revoked INTEGER NOT NULL,
 INDEX unicore_api_credentials_owner_idx (user_id,kind,created_at),
 INDEX unicore_api_credentials_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS unicore_api_refresh_tokens (
 token_hash VARCHAR(64) NOT NULL PRIMARY KEY, credential_id VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL, used INTEGER NOT NULL,
 INDEX unicore_api_refresh_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS unicore_api_token_keys (
 id VARCHAR(64) NOT NULL PRIMARY KEY, secret TEXT NOT NULL,
 created_at BIGINT NOT NULL, valid_until BIGINT NOT NULL, active INTEGER NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Personal security tables inherited the database default in platform@1.
-- Pin existing textual join keys to the platform collation; keep stored values.
ALTER TABLE unicore_personal_accounts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE unicore_session_details CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
ALTER TABLE unicore_email_changes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
