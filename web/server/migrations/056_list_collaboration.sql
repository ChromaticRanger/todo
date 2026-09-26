-- User-to-user list collaboration.
--
-- NOT to be confused with `shared_lists` (migration 007) — that is the Discover
-- feature, which publishes a read-only snapshot for strangers to clone. This is
-- live shared access between two accounts.
--
-- A list is not an entity here: it's the (user_id, list_name) pair on `todos`.
-- Rather than migrate todos.list_name -> todos.list_id (which would touch every
-- route and every name-keyed app_settings blob), we give an identity to the
-- SHARE instead: one list_collab row per shared list, whose `id` is the stable
-- handle every member addresses it by. Consequences worth knowing:
--
--   * An owner renaming the list updates list_name here and is invisible to
--     collaborators — their tab and their per-list prefs keep working.
--   * Shared todos keep user_id = the owner, so every (user_id, ...) index, the
--     ON DELETE CASCADE from "user", and all the free-tier counting in
--     lib/limits.ts stay correct with no change. A collaborator's items consume
--     the OWNER's quota.
--   * Rows exist only for lists actually shared, so there is nothing to backfill.

CREATE TABLE IF NOT EXISTS list_collab (
  id            BIGSERIAL   PRIMARY KEY,
  owner_user_id TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  list_name     TEXT        NOT NULL,
  -- Bumped on every mutation to a todo in this list. Drives the polling
  -- transport (GET /api/collab/changes?since=) before SSE lands, and stays
  -- useful afterwards as the reconnect catch-up signal.
  content_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, list_name)
);

CREATE TABLE IF NOT EXISTS list_collab_member (
  id         BIGSERIAL   PRIMARY KEY,
  collab_id  BIGINT      NOT NULL REFERENCES list_collab(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('viewer','editor')),
  invited_by TEXT        REFERENCES "user"(id) ON DELETE SET NULL,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collab_id, user_id)
);

-- Hot path: "which shared lists am I in", run once per aggregate read.
CREATE INDEX IF NOT EXISTS list_collab_member_user_idx
  ON list_collab_member (user_id);

CREATE TABLE IF NOT EXISTS list_collab_invite (
  id          BIGSERIAL   PRIMARY KEY,
  collab_id   BIGINT      NOT NULL REFERENCES list_collab(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('viewer','editor')),
  -- sha256 of the raw token, hex. The raw token exists only in the email, so a
  -- database leak doesn't hand out list access.
  token_hash  TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','revoked')),
  invited_by  TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accepted_by TEXT        REFERENCES "user"(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS list_collab_invite_token_idx
  ON list_collab_invite (token_hash);

-- At most one LIVE invite per (list, email). Declined/revoked/accepted rows
-- stay as history and deliberately do not block a re-invite.
CREATE UNIQUE INDEX IF NOT EXISTS list_collab_invite_pending_idx
  ON list_collab_invite (collab_id, lower(email))
  WHERE status = 'pending';

-- "What's waiting for me?" — matched against the signed-in account's email.
CREATE INDEX IF NOT EXISTS list_collab_invite_email_idx
  ON list_collab_invite (lower(email))
  WHERE status = 'pending';

-- Attribution: who actually added this item. NULL means the list owner (every
-- pre-existing row) or a collaborator who has since deleted their account.
--
-- ON DELETE SET NULL is load-bearing and must NEVER become CASCADE: when a
-- collaborator deletes their account, the items they contributed to someone
-- else's list have to survive. Added NOT VALID so the constraint doesn't force
-- a full scan of `todos` inside this migration's transaction — every existing
-- row is NULL and therefore trivially satisfies it, and all new rows are
-- checked normally.
ALTER TABLE todos ADD COLUMN IF NOT EXISTS created_by_user_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'todos_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE todos
      ADD CONSTRAINT todos_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES "user"(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END$$;
