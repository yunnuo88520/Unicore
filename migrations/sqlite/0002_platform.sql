-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: M2 platform schema (sqlite).
-- Compatibility: additive CREATE IF NOT EXISTS; version checksum is immutable after release.
-- Rollback: restore an offline/native database backup; never drop populated identity tables automatically.
CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(64) NOT NULL UNIQUE, email VARCHAR(254) NOT NULL UNIQUE, password_hash TEXT NOT NULL, status VARCHAR(16) NOT NULL, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL, last_login_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS roles (id VARCHAR(64) PRIMARY KEY, name VARCHAR(64) NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS permissions (id VARCHAR(128) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS user_roles (user_id VARCHAR(64) NOT NULL REFERENCES users(id), role_id VARCHAR(64) NOT NULL REFERENCES roles(id), PRIMARY KEY (user_id, role_id));
CREATE TABLE IF NOT EXISTS role_permissions (role_id VARCHAR(64) NOT NULL REFERENCES roles(id), permission_id VARCHAR(128) NOT NULL REFERENCES permissions(id), PRIMARY KEY (role_id, permission_id));
CREATE TABLE IF NOT EXISTS sessions (token_hash VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64) NOT NULL REFERENCES users(id), expires_at BIGINT NOT NULL);
