-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform 5 adds the MCP OAuth authorization service storage: pre-registered clients, single-role grants, one-time codes and rotating token families; postgres; web-platform only.
-- Compatibility: additive tables; clients and grants start empty and disabled until the OAuth switch is reviewed.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.

CREATE TABLE IF NOT EXISTS public."unicore_mcp_oauth_clients" (
  "id" character varying(64) NOT NULL,
  "name" character varying(80) NOT NULL,
  "client_type" character varying(16) NOT NULL,
  "auth_method" character varying(16) NOT NULL,
  "redirect_uris" text NOT NULL,
  "enabled" integer NOT NULL DEFAULT 0,
  "client_secret_hash" character varying(64) NOT NULL DEFAULT '',
  "version" bigint NOT NULL DEFAULT 1,
  "created_at" bigint NOT NULL DEFAULT 0,
  "updated_at" bigint NOT NULL DEFAULT 0,
  "updated_by" character varying(64) NOT NULL DEFAULT '',
  CONSTRAINT "unicore_mcp_oauth_clients_pkey" PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public."unicore_mcp_oauth_grants" (
  "id" character varying(64) NOT NULL,
  "user_id" character varying(64) NOT NULL,
  "client_id" character varying(64) NOT NULL,
  "role_id" character varying(64) NOT NULL,
  "resource" character varying(2048) NOT NULL,
  "scope_set" text NOT NULL,
  "status" character varying(16) NOT NULL DEFAULT 'active',
  "security_anchor" character varying(64) NOT NULL DEFAULT '',
  "created_at" bigint NOT NULL DEFAULT 0,
  "last_used_at" bigint NOT NULL DEFAULT 0,
  "revoked_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_mcp_oauth_grants_pkey" PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS unicore_mcp_grants_user ON unicore_mcp_oauth_grants(user_id,status);
CREATE INDEX IF NOT EXISTS unicore_mcp_grants_client ON unicore_mcp_oauth_grants(client_id,status);

CREATE TABLE IF NOT EXISTS public."unicore_mcp_oauth_codes" (
  "code_hash" character varying(64) NOT NULL,
  "grant_id" character varying(64) NOT NULL,
  "redirect_uri" character varying(2048) NOT NULL,
  "pkce_challenge" character varying(128) NOT NULL DEFAULT '',
  "pkce_method" character varying(16) NOT NULL DEFAULT '',
  "expires_at" bigint NOT NULL,
  "consumed_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_mcp_oauth_codes_pkey" PRIMARY KEY (code_hash)
);
CREATE INDEX IF NOT EXISTS unicore_mcp_codes_expiry ON unicore_mcp_oauth_codes(expires_at);

CREATE TABLE IF NOT EXISTS public."unicore_mcp_oauth_tokens" (
  "token_hash" character varying(64) NOT NULL,
  "kind" character varying(16) NOT NULL,
  "grant_id" character varying(64) NOT NULL,
  "family_id" character varying(64) NOT NULL,
  "parent_id" character varying(64) NOT NULL DEFAULT '',
  "scopes" text NOT NULL DEFAULT '',
  "expires_at" bigint NOT NULL,
  "consumed_at" bigint NOT NULL DEFAULT 0,
  "revoked_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_mcp_oauth_tokens_pkey" PRIMARY KEY (token_hash)
);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_grant ON unicore_mcp_oauth_tokens(grant_id,kind);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_family ON unicore_mcp_oauth_tokens(family_id,kind);
CREATE INDEX IF NOT EXISTS unicore_mcp_tokens_expiry ON unicore_mcp_oauth_tokens(expires_at);
