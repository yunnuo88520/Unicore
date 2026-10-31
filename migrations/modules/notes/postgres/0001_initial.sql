-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: module.notes version 1 final-state baseline; postgres; web-platform, web-standalone.
-- Compatibility: new-generation empty databases only; never replay 0.x cleanup or identity moves.
-- Recovery: discard only an explicitly owned test target, or restore matching full snapshots to a new target.
-- Runtime activation is deferred to R1.0c; the legacy executor does not embed this file.

CREATE TABLE public."example_notes" (
  "scope_key" character varying(96) NOT NULL,
  "id" character varying(64) NOT NULL,
  "title" character varying(120) NOT NULL,
  "body" text NOT NULL,
  "status" character varying(16) NOT NULL,
  "attachment_ids" text NOT NULL,
  "version" integer NOT NULL,
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  "deleted_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "example_notes_pkey" PRIMARY KEY (scope_key, id)
);

CREATE INDEX example_notes_owner_updated ON public.example_notes USING btree (scope_key, updated_at, id);

CREATE INDEX idx_notes_active ON public.example_notes USING btree (scope_key, deleted_at, updated_at);
