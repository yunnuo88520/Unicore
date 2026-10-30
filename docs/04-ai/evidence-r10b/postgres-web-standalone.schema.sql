-- Author: yunnuo <ymz@ebox.vip>
-- Generated new-baseline observed schema evidence; not a migration definition.
--
-- PostgreSQL database dump
--

\restrict 3EnicQlDjkstTya72arfIHInzL5QtvFcaCqRuhutvyrdYmCUuN9e4tLSSqclzjS

-- Dumped from database version 15.17 (Debian 15.17-1.pgdg13+1)
-- Dumped by pg_dump version 15.17 (Debian 15.17-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id character varying(64) NOT NULL,
    actor_id character varying(64) NOT NULL,
    action character varying(128) NOT NULL,
    created_at bigint NOT NULL
);


--
-- Name: example_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.example_notes (
    scope_key character varying(96) NOT NULL,
    id character varying(64) NOT NULL,
    title character varying(120) NOT NULL,
    body text NOT NULL,
    status character varying(16) NOT NULL,
    attachment_ids text NOT NULL,
    version integer NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    deleted_at bigint DEFAULT 0 NOT NULL
);


--
-- Name: install_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.install_state (
    id integer NOT NULL,
    profile character varying(32) NOT NULL,
    instance_id character varying(64) NOT NULL,
    installed_at bigint NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    namespace character varying(96) NOT NULL,
    version bigint NOT NULL,
    checksum character varying(64) NOT NULL,
    applied_at bigint NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    setting_key character varying(128) NOT NULL,
    setting_value text NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: example_notes example_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_notes
    ADD CONSTRAINT example_notes_pkey PRIMARY KEY (scope_key, id);


--
-- Name: install_state install_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.install_state
    ADD CONSTRAINT install_state_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (namespace, version);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (setting_key);


--
-- Name: example_notes_owner_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX example_notes_owner_updated ON public.example_notes USING btree (scope_key, updated_at, id);


--
-- Name: idx_notes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_active ON public.example_notes USING btree (scope_key, deleted_at, updated_at);


--
-- PostgreSQL database dump complete
--

\unrestrict 3EnicQlDjkstTya72arfIHInzL5QtvFcaCqRuhutvyrdYmCUuN9e4tLSSqclzjS
