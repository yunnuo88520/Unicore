-- Author: yunnuo <ymz@ebox.vip>
-- Personal-center state, isolated by identity realm; additive after fixed-prefix migration.
-- Compatibility: existing accounts/sessions remain valid; absent security row means TOTP disabled.
-- Recovery: stop writes and restore a complete database+key backup; do not downgrade after enrollment.
CREATE TABLE IF NOT EXISTS unicore_personal_accounts (
 user_id VARCHAR(64) PRIMARY KEY REFERENCES unicore_users(id),
 display_name VARCHAR(80) NOT NULL, totp_secret TEXT NOT NULL, recovery_digests TEXT NOT NULL,
 last_step BIGINT NOT NULL, setup_secret TEXT NOT NULL, setup_session VARCHAR(64) NOT NULL, setup_expires BIGINT NOT NULL, setup_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_session_details (
 token_hash VARCHAR(64) PRIMARY KEY REFERENCES unicore_sessions(token_hash) ON DELETE CASCADE,
 user_id VARCHAR(64) NOT NULL REFERENCES unicore_users(id),
 ip_address VARCHAR(64) NOT NULL, user_agent VARCHAR(512) NOT NULL,
 created_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL, mfa_verified INTEGER NOT NULL, mfa_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_email_changes (
 id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES unicore_users(id),
 session_hash VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL,
 original_email VARCHAR(254) NOT NULL, target_email VARCHAR(254) NOT NULL,
 code_digest VARCHAR(64) NOT NULL, verified INTEGER NOT NULL, attempts INTEGER NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_administrator_personal_accounts (
 user_id VARCHAR(64) PRIMARY KEY REFERENCES unicore_administrators(id),
 display_name VARCHAR(80) NOT NULL, totp_secret TEXT NOT NULL, recovery_digests TEXT NOT NULL,
 last_step BIGINT NOT NULL, setup_secret TEXT NOT NULL, setup_session VARCHAR(64) NOT NULL, setup_expires BIGINT NOT NULL, setup_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_administrator_session_details (
 token_hash VARCHAR(64) PRIMARY KEY REFERENCES unicore_administrator_sessions(token_hash) ON DELETE CASCADE,
 user_id VARCHAR(64) NOT NULL REFERENCES unicore_administrators(id),
 ip_address VARCHAR(64) NOT NULL, user_agent VARCHAR(512) NOT NULL,
 created_at BIGINT NOT NULL, last_seen_at BIGINT NOT NULL, mfa_verified INTEGER NOT NULL, mfa_attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS unicore_administrator_email_changes (
 id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES unicore_administrators(id),
 session_hash VARCHAR(64) NOT NULL, parent_id VARCHAR(64) NOT NULL,
 original_email VARCHAR(254) NOT NULL, target_email VARCHAR(254) NOT NULL,
 code_digest VARCHAR(64) NOT NULL, verified INTEGER NOT NULL, attempts INTEGER NOT NULL,
 created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL
);
