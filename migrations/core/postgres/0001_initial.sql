-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: core version 1 final-state baseline; postgres; web-platform, web-standalone.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.

CREATE TABLE public."install_state" (
  "id" integer NOT NULL,
  "profile" character varying(32) NOT NULL,
  "instance_id" character varying(64) NOT NULL,
  "installed_at" bigint NOT NULL,
  CONSTRAINT "install_state_pkey" PRIMARY KEY (id)
);

CREATE TABLE public."system_settings" (
  "setting_key" character varying(128) NOT NULL,
  "setting_value" text NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY (setting_key)
);

CREATE TABLE public."audit_logs" (
  "id" character varying(64) NOT NULL,
  "actor_id" character varying(64) NOT NULL,
  "action" character varying(128) NOT NULL,
  "created_at" bigint NOT NULL,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id)
);
