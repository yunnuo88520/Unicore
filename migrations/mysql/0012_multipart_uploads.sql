-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: durable platform-only multipart session identity and immutable chunk policy.
-- Compatibility: additive table; old binaries cannot resume these sessions. Do not roll back while pending.
-- Recovery: stop service; restore matching DB, private data, instance key, binary and bucket backup.
CREATE TABLE IF NOT EXISTS file_upload_sessions (
 file_id VARCHAR(80) PRIMARY KEY,
 upload_id TEXT NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,
 part_size BIGINT NOT NULL,
 FOREIGN KEY (file_id) REFERENCES file_metadata(id)
) ENGINE=InnoDB;
