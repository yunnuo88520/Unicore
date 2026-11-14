-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform 3 adds MCP governance storage: control CAS anchor, capability open policies and call metadata; sqlite; web-platform only.
-- Compatibility: additive tables; policies start disabled and control starts at revision 0.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.

CREATE TABLE IF NOT EXISTS unicore_mcp_control (
 id INTEGER NOT NULL PRIMARY KEY,
 revision BIGINT NOT NULL DEFAULT 0,
 created_at BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL DEFAULT 0,
 updated_by VARCHAR(64) NOT NULL DEFAULT ''
);
INSERT INTO unicore_mcp_control(id,revision,created_at,updated_at,updated_by) SELECT 1,0,0,0,'' WHERE NOT EXISTS (SELECT 1 FROM unicore_mcp_control WHERE id=1);

CREATE TABLE IF NOT EXISTS unicore_mcp_capability_policies (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 kind VARCHAR(16) NOT NULL,
 name VARCHAR(128) NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0,
 accepted_fingerprint VARCHAR(64) NOT NULL DEFAULT '',
 accepted_version VARCHAR(32) NOT NULL DEFAULT '',
 version BIGINT NOT NULL DEFAULT 1,
 created_at BIGINT NOT NULL DEFAULT 0,
 updated_at BIGINT NOT NULL DEFAULT 0,
 updated_by VARCHAR(64) NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_mcp_policy_kind_name ON unicore_mcp_capability_policies(kind,name);
CREATE INDEX IF NOT EXISTS unicore_mcp_policy_enabled ON unicore_mcp_capability_policies(enabled);

CREATE TABLE IF NOT EXISTS unicore_mcp_calls (
 id VARCHAR(64) NOT NULL PRIMARY KEY,
 request_id VARCHAR(64) NOT NULL,
 actor_id VARCHAR(64) NOT NULL,
 credential_id VARCHAR(64) NOT NULL,
 role_id VARCHAR(64) NOT NULL,
 auth_method VARCHAR(16) NOT NULL,
 kind VARCHAR(16) NOT NULL,
 name VARCHAR(128) NOT NULL,
 capability_version VARCHAR(32) NOT NULL DEFAULT '',
 policy_revision BIGINT NOT NULL DEFAULT 0,
 protocol_version VARCHAR(16) NOT NULL DEFAULT '',
 client_name VARCHAR(80) NOT NULL DEFAULT '',
 client_version VARCHAR(40) NOT NULL DEFAULT '',
 status VARCHAR(16) NOT NULL DEFAULT '',
 error_code VARCHAR(128) NOT NULL DEFAULT '',
 started_at BIGINT NOT NULL DEFAULT 0,
 finished_at BIGINT NOT NULL DEFAULT 0,
 duration_ms BIGINT NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS unicore_mcp_calls_request ON unicore_mcp_calls(request_id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_started ON unicore_mcp_calls(started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_actor ON unicore_mcp_calls(actor_id,started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_capability ON unicore_mcp_calls(kind,name,started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_status ON unicore_mcp_calls(status,started_at,id);
