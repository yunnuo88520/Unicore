-- Author: yunnuo <ymz@ebox.vip>
-- Purpose: platform version 8: independent posts and user-only multiple post memberships.
-- Profile: web-platform only; follows platform version 7 by namespace version ordering.
-- Compatibility: additive tables only; existing users have no posts. Posts do not confer roles or permissions.
-- Memberships reference users only; deleting a referenced post is restricted, deleting a user cascades.
-- Recovery: transactional DDL rolls back on failure; replay is idempotent. Restore matching snapshots
-- to a new isolated target for rollback; do not remove ledger rows or reuse an older binary alone.
CREATE TABLE IF NOT EXISTS public.unicore_posts (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(64) NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    description VARCHAR(500) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS unicore_posts_sort_idx ON public.unicore_posts(sort, code, id);
CREATE TABLE IF NOT EXISTS public.unicore_user_posts (
    user_id VARCHAR(64) NOT NULL,
    post_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (user_id, post_id),
    CONSTRAINT unicore_user_posts_user_fk FOREIGN KEY (user_id) REFERENCES public.unicore_users(id) ON DELETE CASCADE,
    CONSTRAINT unicore_user_posts_post_fk FOREIGN KEY (post_id) REFERENCES public.unicore_posts(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS unicore_user_posts_post_idx ON public.unicore_user_posts(post_id, user_id);
