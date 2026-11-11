-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 2: operator-editable menu configuration and business data dictionaries.
-- Compatibility: additive empty tables; the seed supplies no rows, missing menu rows fall back to route defaults.
-- Recovery: transactional; stop and restore a matching database backup after partial DDL; drop the tables to roll back.
CREATE TABLE IF NOT EXISTS public."unicore_menus" (
  "menu_key" character varying(64) NOT NULL,
  "label" character varying(80) NOT NULL DEFAULT '',
  "group_key" character varying(32) NOT NULL DEFAULT '',
  "sort" integer NOT NULL DEFAULT 100,
  "visible" bigint NOT NULL DEFAULT 1,
  "updated_at" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "unicore_menus_pkey" PRIMARY KEY (menu_key)
);
CREATE TABLE IF NOT EXISTS public."unicore_dict_types" (
  "id" character varying(64) NOT NULL,
  "code" character varying(64) NOT NULL,
  "name" character varying(80) NOT NULL,
  "description" character varying(200) NOT NULL DEFAULT '',
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  CONSTRAINT "unicore_dict_types_pkey" PRIMARY KEY (id),
  CONSTRAINT "unicore_dict_types_code_key" UNIQUE (code)
);
CREATE TABLE IF NOT EXISTS public."unicore_dict_items" (
  "id" character varying(64) NOT NULL,
  "type_code" character varying(64) NOT NULL REFERENCES public."unicore_dict_types"(code) ON DELETE CASCADE,
  "value" character varying(128) NOT NULL,
  "label" character varying(80) NOT NULL,
  "remark" character varying(200) NOT NULL DEFAULT '',
  "sort" integer NOT NULL DEFAULT 0,
  "status" character varying(16) NOT NULL DEFAULT 'active',
  "created_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  CONSTRAINT "unicore_dict_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "unicore_dict_items_type_value_key" UNIQUE (type_code, value)
);
CREATE INDEX IF NOT EXISTS unicore_dict_items_type_sort ON public.unicore_dict_items USING btree (type_code, sort);
