-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Isolated enterprise identities and encrypted, single-use browser-bound flows.
-- Compatibility: additive, platform only; existing password accounts are unchanged.
-- Rollback: stop the instance and restore the database/config/key snapshot together.
CREATE TABLE IF NOT EXISTS external_identities (
 identity_hash VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL UNIQUE,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS oidc_flows (
 state_hash VARCHAR(64) PRIMARY KEY,
 browser_hash VARCHAR(64) NOT NULL,
 sealed_payload TEXT NOT NULL,
 expires_at BIGINT NOT NULL
);
