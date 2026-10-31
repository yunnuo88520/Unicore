-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Add platform audit snapshots without modifying historical framework records.
-- Compatibility: additive table; old records have no metadata. MySQL CREATE IF NOT EXISTS supports retry after implicit DDL commit.
-- Recovery: restore an offline backup with matching program; never drop historical records on rollback.
CREATE TABLE IF NOT EXISTS audit_metadata (audit_id VARCHAR(64) PRIMARY KEY, actor_name VARCHAR(64) NOT NULL, realm VARCHAR(32) NOT NULL, target VARCHAR(256) NOT NULL, detail VARCHAR(512) NOT NULL, ip_address VARCHAR(64) NOT NULL, FOREIGN KEY (audit_id) REFERENCES audit_logs(id));
