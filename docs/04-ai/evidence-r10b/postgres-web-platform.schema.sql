-- Author: yunnuo <ymz@ebox.vip>
-- Generated new-baseline observed schema evidence; not a migration definition.
--
-- PostgreSQL database dump
--

\restrict HbPxVxL7D3BPQq2uHFf81k7NUHzaQcc0CiWEY2kBwuFA8JejwUsdGBf5EAnI0A3

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
-- Name: account_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_tokens (
    token_hash character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    purpose character varying(16) NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: administrator_account_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrator_account_tokens (
    token_hash character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    purpose character varying(16) NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: administrator_email_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrator_email_challenges (
    id character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    purpose character varying(16) NOT NULL,
    code_digest character varying(64) NOT NULL,
    expires_at bigint NOT NULL,
    created_at bigint NOT NULL,
    attempts integer NOT NULL
);


--
-- Name: administrator_external_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrator_external_identities (
    identity_hash character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    created_at bigint NOT NULL
);


--
-- Name: administrator_oidc_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrator_oidc_flows (
    state_hash character varying(64) NOT NULL,
    browser_hash character varying(64) NOT NULL,
    sealed_payload text NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: administrator_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrator_roles (
    user_id character varying(64) NOT NULL,
    role_id character varying(64) NOT NULL
);


--
-- Name: administrator_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrator_sessions (
    token_hash character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: administrators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.administrators (
    id character varying(64) NOT NULL,
    username character varying(64) NOT NULL,
    email character varying(254) NOT NULL,
    password_hash text NOT NULL,
    status character varying(16) NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    last_login_at bigint NOT NULL
);


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
-- Name: audit_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_metadata (
    audit_id character varying(64) NOT NULL,
    actor_name character varying(64) NOT NULL,
    realm character varying(32) NOT NULL,
    target character varying(256) NOT NULL,
    detail character varying(512) NOT NULL,
    ip_address character varying(64) NOT NULL
);


--
-- Name: email_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_challenges (
    id character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    purpose character varying(16) NOT NULL,
    code_digest character varying(64) NOT NULL,
    expires_at bigint NOT NULL,
    created_at bigint NOT NULL,
    attempts integer NOT NULL
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
-- Name: external_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_identities (
    identity_hash character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    issuer text NOT NULL,
    subject text NOT NULL,
    created_at bigint NOT NULL
);


--
-- Name: file_cleanup_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_cleanup_jobs (
    id character varying(80) NOT NULL,
    location_id character varying(80) NOT NULL,
    file_key character varying(1024) NOT NULL,
    due_at bigint NOT NULL,
    attempts integer NOT NULL,
    last_error character varying(64) NOT NULL
);


--
-- Name: file_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_metadata (
    id character varying(80) NOT NULL,
    original_name character varying(255) NOT NULL,
    storage_type character varying(16) NOT NULL,
    location_id character varying(80) NOT NULL,
    file_key character varying(1024) NOT NULL,
    staging_key character varying(1024) NOT NULL,
    mime_type character varying(160) NOT NULL,
    size bigint NOT NULL,
    etag character varying(200) NOT NULL,
    state character varying(16) NOT NULL,
    purpose character varying(16) NOT NULL,
    creator_id character varying(80) NOT NULL,
    creator_realm character varying(24) NOT NULL,
    created_at bigint NOT NULL,
    expires_at bigint NOT NULL,
    upload_expires_at bigint NOT NULL,
    cleanup_at bigint NOT NULL
);


--
-- Name: file_upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.file_upload_sessions (
    file_id character varying(80) NOT NULL,
    upload_id text NOT NULL,
    fingerprint character varying(64) NOT NULL,
    part_size bigint NOT NULL
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
-- Name: mail_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_jobs (
    id character varying(64) NOT NULL,
    token_hash character varying(64) NOT NULL,
    payload text NOT NULL,
    state character varying(16) NOT NULL,
    attempts integer NOT NULL,
    created_at bigint NOT NULL,
    available_at bigint NOT NULL,
    expires_at bigint NOT NULL,
    lease_id character varying(64) NOT NULL,
    lease_until bigint NOT NULL,
    last_error character varying(32) NOT NULL
);


--
-- Name: oidc_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.oidc_flows (
    state_hash character varying(64) NOT NULL,
    browser_hash character varying(64) NOT NULL,
    sealed_payload text NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id character varying(128) NOT NULL
);


--
-- Name: platform_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_announcements (
    id character varying(64) NOT NULL,
    content text NOT NULL,
    content_html text NOT NULL,
    format character varying(16) NOT NULL,
    type character varying(16) NOT NULL,
    note character varying(400) NOT NULL,
    status character varying(16) NOT NULL,
    publish_at bigint NOT NULL,
    created_by character varying(64) NOT NULL,
    updated_by character varying(64) NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    deleted_at bigint DEFAULT 0 NOT NULL,
    version bigint DEFAULT 1 NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id character varying(64) NOT NULL,
    permission_id character varying(128) NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id character varying(64) NOT NULL,
    name character varying(64) NOT NULL
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
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    token_hash character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    expires_at bigint NOT NULL
);


--
-- Name: storage_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_locations (
    id character varying(80) NOT NULL,
    name character varying(80) NOT NULL,
    provider character varying(16) NOT NULL,
    endpoint character varying(2048) NOT NULL,
    bucket character varying(128) NOT NULL,
    region character varying(128) NOT NULL,
    prefix character varying(200) NOT NULL,
    path_style integer NOT NULL,
    credentials text NOT NULL,
    tested integer NOT NULL,
    created_at bigint NOT NULL
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    setting_key character varying(128) NOT NULL,
    setting_value text NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id character varying(64) NOT NULL,
    role_id character varying(64) NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying(64) NOT NULL,
    username character varying(64) NOT NULL,
    email character varying(254) NOT NULL,
    password_hash text NOT NULL,
    status character varying(16) NOT NULL,
    created_at bigint NOT NULL,
    updated_at bigint NOT NULL,
    last_login_at bigint NOT NULL
);


--
-- Name: account_tokens account_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_tokens
    ADD CONSTRAINT account_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: administrator_account_tokens administrator_account_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_account_tokens
    ADD CONSTRAINT administrator_account_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: administrator_email_challenges administrator_email_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_email_challenges
    ADD CONSTRAINT administrator_email_challenges_pkey PRIMARY KEY (id);


--
-- Name: administrator_external_identities administrator_external_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_external_identities
    ADD CONSTRAINT administrator_external_identities_pkey PRIMARY KEY (identity_hash);


--
-- Name: administrator_external_identities administrator_external_identities_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_external_identities
    ADD CONSTRAINT administrator_external_identities_user_id_key UNIQUE (user_id);


--
-- Name: administrator_oidc_flows administrator_oidc_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_oidc_flows
    ADD CONSTRAINT administrator_oidc_flows_pkey PRIMARY KEY (state_hash);


--
-- Name: administrator_roles administrator_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_roles
    ADD CONSTRAINT administrator_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: administrator_sessions administrator_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_sessions
    ADD CONSTRAINT administrator_sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: administrators administrators_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrators
    ADD CONSTRAINT administrators_email_key UNIQUE (email);


--
-- Name: administrators administrators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrators
    ADD CONSTRAINT administrators_pkey PRIMARY KEY (id);


--
-- Name: administrators administrators_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrators
    ADD CONSTRAINT administrators_username_key UNIQUE (username);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: audit_metadata audit_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_metadata
    ADD CONSTRAINT audit_metadata_pkey PRIMARY KEY (audit_id);


--
-- Name: email_challenges email_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_challenges
    ADD CONSTRAINT email_challenges_pkey PRIMARY KEY (id);


--
-- Name: example_notes example_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.example_notes
    ADD CONSTRAINT example_notes_pkey PRIMARY KEY (scope_key, id);


--
-- Name: external_identities external_identities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_identities
    ADD CONSTRAINT external_identities_pkey PRIMARY KEY (identity_hash);


--
-- Name: external_identities external_identities_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_identities
    ADD CONSTRAINT external_identities_user_id_key UNIQUE (user_id);


--
-- Name: file_cleanup_jobs file_cleanup_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_cleanup_jobs
    ADD CONSTRAINT file_cleanup_jobs_pkey PRIMARY KEY (id);


--
-- Name: file_metadata file_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_metadata
    ADD CONSTRAINT file_metadata_pkey PRIMARY KEY (id);


--
-- Name: file_upload_sessions file_upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_upload_sessions
    ADD CONSTRAINT file_upload_sessions_pkey PRIMARY KEY (file_id);


--
-- Name: install_state install_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.install_state
    ADD CONSTRAINT install_state_pkey PRIMARY KEY (id);


--
-- Name: mail_jobs mail_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_jobs
    ADD CONSTRAINT mail_jobs_pkey PRIMARY KEY (id);


--
-- Name: oidc_flows oidc_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oidc_flows
    ADD CONSTRAINT oidc_flows_pkey PRIMARY KEY (state_hash);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: platform_announcements platform_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_announcements
    ADD CONSTRAINT platform_announcements_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (namespace, version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: storage_locations storage_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_locations
    ADD CONSTRAINT storage_locations_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (setting_key);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_key UNIQUE (username);


--
-- Name: example_notes_owner_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX example_notes_owner_updated ON public.example_notes USING btree (scope_key, updated_at, id);


--
-- Name: file_cleanup_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_cleanup_due ON public.file_cleanup_jobs USING btree (due_at);


--
-- Name: file_cleanup_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_cleanup_location ON public.file_cleanup_jobs USING btree (location_id);


--
-- Name: file_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_created ON public.file_metadata USING btree (purpose, created_at, id);


--
-- Name: file_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_expiry ON public.file_metadata USING btree (expires_at);


--
-- Name: file_location_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_location_state ON public.file_metadata USING btree (location_id, state);


--
-- Name: file_owner_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_owner_created ON public.file_metadata USING btree (purpose, creator_realm, creator_id, created_at, id);


--
-- Name: file_pending_cleanup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX file_pending_cleanup ON public.file_metadata USING btree (state, cleanup_at);


--
-- Name: idx_announcements_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_feed ON public.platform_announcements USING btree (deleted_at, status, publish_at, id);


--
-- Name: idx_notes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notes_active ON public.example_notes USING btree (scope_key, deleted_at, updated_at);


--
-- Name: account_tokens account_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_tokens
    ADD CONSTRAINT account_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: administrator_account_tokens administrator_account_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_account_tokens
    ADD CONSTRAINT administrator_account_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.administrators(id);


--
-- Name: administrator_email_challenges administrator_email_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_email_challenges
    ADD CONSTRAINT administrator_email_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.administrators(id);


--
-- Name: administrator_external_identities administrator_external_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_external_identities
    ADD CONSTRAINT administrator_external_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.administrators(id);


--
-- Name: administrator_roles administrator_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_roles
    ADD CONSTRAINT administrator_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: administrator_roles administrator_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_roles
    ADD CONSTRAINT administrator_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.administrators(id);


--
-- Name: administrator_sessions administrator_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.administrator_sessions
    ADD CONSTRAINT administrator_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.administrators(id);


--
-- Name: audit_metadata audit_metadata_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_metadata
    ADD CONSTRAINT audit_metadata_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES public.audit_logs(id);


--
-- Name: email_challenges email_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_challenges
    ADD CONSTRAINT email_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: external_identities external_identities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_identities
    ADD CONSTRAINT external_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: file_cleanup_jobs file_cleanup_jobs_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_cleanup_jobs
    ADD CONSTRAINT file_cleanup_jobs_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id);


--
-- Name: file_metadata file_metadata_location_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_metadata
    ADD CONSTRAINT file_metadata_location_id_fkey FOREIGN KEY (location_id) REFERENCES public.storage_locations(id);


--
-- Name: file_upload_sessions file_upload_sessions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.file_upload_sessions
    ADD CONSTRAINT file_upload_sessions_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.file_metadata(id);


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id);


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict HbPxVxL7D3BPQq2uHFf81k7NUHzaQcc0CiWEY2kBwuFA8JejwUsdGBf5EAnI0A3
