-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform 5 adds the MCP OAuth authorization service storage: pre-registered clients, single-role grants, one-time codes and rotating token families; sqlite; web-platform only.
-- Compatibility: additive tables; clients and grants start empty and disabled until the OAuth switch is reviewed.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.

CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_clients (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 name VARCHAR(80) NOT NULL,
 client_type VARCHAR(16) NOT NULL,
 auth_method VARCHAR(16) NOT NULL,
 redirect_uris TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0,
 client_secret_hash VARCHAR(64) NOT NULL DEFAULT '',
 version BIGINT NOT NULL DEFAULT 1,
 created_at BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL DEFAULT 0,
 updated_by VARCHAR(64) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_grants (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL,
 client_id VARCHAR(64) NOT NULL,
 role_id VARCHAR(64) NOT NULL,
 resource VARCHAR(2048) NOT NULL,
 scope_set TEXT NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'active',
 security_anchor VARCHAR(64) NOT NULL DEFAULT '',
 created_at BIGINT NOT NULL DEFAULT 0,
 last_used_at BIGINT NOT NULL DEFAULT 0,
 revoked_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS unicore_mcp_grants_user ON unicore_mcp_oauth_grants(user_id,status);
CREATE INDEX IF NOT EXISTS unicore_mcp_grants_client ON unicore_mcp_oauth_grants(client_id,status);

CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_codes (
 code_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 grant_id VARCHAR(64) NOT NULL,
 redirect_uri VARCHAR(2048) NOT NULL,
 pkce_challenge VARCHAR(128) NOT NULL DEFAULT '',
 pkce_method VARCHAR(16) NOT NULL DEFAULT '',
 expires_at BIGINT NOT NULL,
 consumed_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS unicore_mcp_codes_expiry ON unicore_mcp_oauth_codes(expires_at);

CREATE TABLE IF NOT EXISTS unicore_mcp_oauth_tokens (
 token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
 kind VARCHAR(16) NOT NULL,
 grant_id VARCHAR(64) NOT NULL,
 family_id VARCHAR(64) NOT NULL,
 parent_id VARCHAR(64) NOT NULL DEFAULT '',
 scopes TEXT NOT NULL DEFAULT '',
 expires_at BIGINT NOT NULL,
 consumed_at BIGINT NOT NULL DEFAULT 0,
 revoked_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_grant ON unicore_mcp_oauth_tokens(grant_id,kind);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_family ON unicore_mcp_oauth_tokens(family_id,kind);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_expiry ON unicore_mcp_oauth_tokens(expires_at);
