-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: Six-digit email challenges with persistent retry limits; platform only.
-- Compatibility: Additive; stop workers and restore DB/config/key together to roll back.
CREATE TABLE IF NOT EXISTS email_challenges (
 id VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(64) NOT NULL,
 purpose VARCHAR(16) NOT NULL,
 code_digest VARCHAR(64) NOT NULL,
 expires_at BIGINT NOT NULL,
 created_at BIGINT NOT NULL,
 attempts INTEGER NOT NULL,
 FOREIGN KEY (user_id) REFERENCES users(id)
);
