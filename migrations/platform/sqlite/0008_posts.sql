-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 8: independent posts and user-only multiple post memberships.
-- Profile: web-platform only; follows platform version 7 by namespace version ordering.
-- Compatibility: additive tables only; existing users have no posts. Posts do not confer roles or permissions.
-- SQLite intentionally has no foreign keys; locked application transactions enforce user/post references.
-- Recovery: transactional DDL rolls back on failure; replay is idempotent. Restore matching snapshots
-- to a new isolated target for rollback; do not remove ledger rows or reuse an older binary alone.
CREATE TABLE IF NOT EXISTS unicore_posts (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    description VARCHAR(500) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS unicore_posts_sort_idx ON unicore_posts(sort, code, id);
CREATE TABLE IF NOT EXISTS unicore_user_posts (
    user_id VARCHAR(64) NOT NULL,
    post_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS unicore_user_posts_post_idx ON unicore_user_posts(post_id, user_id);
