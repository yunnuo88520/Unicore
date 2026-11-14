-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform 3 adds MCP governance storage: control CAS anchor, capability open policies and call metadata; postgres; web-platform only.
-- Compatibility: additive tables; policies start disabled and control starts at revision 0.
-- Recovery: restore matching DB/data/config/key/binary snapshots to a new target. No down SQL.

CREATE TABLE IF NOT EXISTS public."unicore_mcp_control" (
  "id" integer NOT NULL,
  "revision" bigint NOT NULL DEFAULT 0,
  "created_at" bigint NOT NULL DEFAULT 0,
  "updated_at" bigint NOT NULL DEFAULT 0,
  "updated_by" character varying(64) NOT NULL DEFAULT '',
  CONSTRAINT "unicore_mcp_control_pkey" PRIMARY KEY (id)
);
INSERT INTO unicore_mcp_control(id,revision,created_at,updated_at,updated_by) SELECT 1,0,0,0,'' WHERE NOT EXISTS (SELECT 1 FROM unicore_mcp_control WHERE id=1);

CREATE TABLE IF NOT EXISTS public."unicore_mcp_capability_policies" (
  "id" character varying(64) NOT NULL,
  "kind" character varying(16) NOT NULL,
  "name" character varying(128) NOT NULL,
  "enabled" integer NOT NULL DEFAULT 0,
  "accepted_fingerprint" character varying(64) NOT NULL DEFAULT '',
  "accepted_version" character varying(32) NOT NULL DEFAULT '',
  "version" bigint NOT NULL DEFAULT 1,
  "created_at" bigint NOT NULL DEFAULT 0,
  "updated_at" bigint NOT NULL DEFAULT 0,
  "updated_by" character varying(64) NOT NULL DEFAULT '',
  CONSTRAINT "unicore_mcp_capability_policies_pkey" PRIMARY KEY (id),
  CONSTRAINT "unicore_mcp_policy_kind_name_key" UNIQUE (kind, name)
);
CREATE INDEX IF NOT EXISTS unicore_mcp_policy_enabled ON unicore_mcp_capability_policies(enabled);

CREATE TABLE IF NOT EXISTS public."unicore_mcp_calls" (
  "id" character varying(64) NOT NULL,
  "request_id" character varying(64) NOT NULL,
  "actor_id" character varying(64) NOT NULL,
  "credential_id" character varying(64) NOT NULL,
  "role_id" character varying(64) NOT NULL,
  "auth_method" character varying(16) NOT NULL,
  "kind" character varying(16) NOT NULL,
  "name" character varying(128) NOT NULL,
  "capability_version" character varying(32) NOT NULL DEFAULT '',
  "policy_revision" bigint NOT NULL DEFAULT 0,
  "protocol_version" character varying(16) NOT NULL DEFAULT '',
  "client_name" character varying(80) NOT NULL DEFAULT '',
  "client_version" character varying(40) NOT NULL DEFAULT '',
  "status" character varying(16) NOT NULL DEFAULT '',
  "error_code" character varying(128) NOT NULL DEFAULT '',
  "started_at" bigint NOT NULL DEFAULT 0,
  "finished_at" bigint NOT NULL DEFAULT 0,
  "duration_ms" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_mcp_calls_pkey" PRIMARY KEY (id),
  CONSTRAINT "unicore_mcp_calls_request_key" UNIQUE (request_id)
);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_started ON unicore_mcp_calls(started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_actor ON unicore_mcp_calls(actor_id,started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_capability ON unicore_mcp_calls(kind,name,started_at,id);
CREATE INDEX IF NOT EXISTS unicore_mcp_calls_status ON unicore_mcp_calls(status,started_at,id);
