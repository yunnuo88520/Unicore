-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Physically separate administrator identities, sessions and recovery/enterprise proofs.
-- Compatibility: preserve IDs, credentials and enterprise links; revoke old sessions/challenges.
-- MySQL DDL can commit early; copy/delete steps are idempotent and must finish before serving traffic.
-- Rollback: stop all instances and restore matching DB/config/key/binary snapshot together.
CREATE TABLE IF NOT EXISTS administrators (id VARCHAR(64) PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL, status VARCHAR(16) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, last_login_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS administrator_roles (user_id VARCHAR(64) NOT NULL REFERENCES administrators(id), role_id VARCHAR(64) NOT NULL REFERENCES roles(id), PRIMARY KEY (user_id, role_id));
CREATE TABLE IF NOT EXISTS administrator_sessions (token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES administrators(id), expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS administrator_account_tokens (token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES administrators(id), purpose VARCHAR(16) NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS administrator_email_challenges (
 id VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL,
 purpose VARCHAR(16) NOT NULL,
 code_digest VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL,
 FOREIGN KEY (user_id) REFERENCES administrators(id)
);
CREATE TABLE IF NOT EXISTS administrator_external_identities (
 identity_hash VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL UNIQUE,
 issuer TEXT NOT NULL,
 subject TEXT NOT NULL,
 created_at BIGINT NOT NULL,
 FOREIGN KEY (user_id) REFERENCES administrators(id)
);
CREATE TABLE IF NOT EXISTS administrator_oidc_flows (
 state_hash VARCHAR(64) PRIMARY KEY,
 browser_hash VARCHAR(64) NOT NULL,
 sealed_payload TEXT NOT NULL,
 expires_at BIGINT NOT NULL
);
INSERT INTO administrators SELECT u.* FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE ur.role_id='super_admin' AND NOT EXISTS (SELECT 1 FROM administrators a WHERE a.id=u.id);
INSERT INTO administrator_roles(user_id,role_id) SELECT a.id,'super_admin' FROM administrators a WHERE NOT EXISTS (SELECT 1 FROM administrator_roles ar WHERE ar.user_id=a.id);
INSERT INTO administrator_external_identities SELECT e.* FROM external_identities e JOIN administrators a ON a.id=e.user_id WHERE NOT EXISTS (SELECT 1 FROM administrator_external_identities ae WHERE ae.identity_hash=e.identity_hash);
DELETE FROM sessions;
DELETE FROM account_tokens;
DELETE FROM email_challenges;
DELETE FROM oidc_flows;
UPDATE mail_jobs SET state='cancelled',payload='',lease_id='',lease_until=0 WHERE state IN ('pending','sending');
DELETE FROM external_identities WHERE user_id IN (SELECT id FROM administrators);
DELETE FROM user_roles WHERE user_id IN (SELECT id FROM administrators);
DELETE FROM users WHERE id IN (SELECT id FROM administrators);
