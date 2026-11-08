-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 8: independent posts and user-only multiple post memberships.
-- Profile: web-platform only; follows platform version 7 by namespace version ordering.
-- Compatibility: additive InnoDB tables only; existing users have no posts. Posts confer no permissions.
-- Binary code comparison matches canonical lowercase ASCII codes on SQLite/PostgreSQL.
-- Recovery: MySQL DDL commits implicitly; IF NOT EXISTS and inline indexes allow interrupted replay.
-- If the resulting structure cannot be verified, restore a matching snapshot into a new isolated target;
-- do not delete ledger rows or promise rollback by replacing the binary alone.
CREATE TABLE IF NOT EXISTS unicore_posts (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    sort INT NOT NULL DEFAULT 0,
    enabled INT NOT NULL DEFAULT 1,
    description VARCHAR(500) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX unicore_posts_sort_idx (sort, code, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS unicore_user_posts (
    user_id VARCHAR(64) NOT NULL,
    post_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, post_id),
    INDEX unicore_user_posts_post_idx (post_id, user_id),
    CONSTRAINT unicore_user_posts_user_fk FOREIGN KEY (user_id) REFERENCES unicore_users(id) ON DELETE CASCADE,
    CONSTRAINT unicore_user_posts_post_fk FOREIGN KEY (post_id) REFERENCES unicore_posts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
