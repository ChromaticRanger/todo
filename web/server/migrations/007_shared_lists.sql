-- Discover: Community Lists feature.
--
-- Two new tables for sharable, read-only lists. They live independently from
-- `todos` so user-scoped queries stay untouched and "read-only when browsed"
-- is intrinsic — there's no insert path from any user-facing route.
--
-- The Stash-Squirrel system user owns the seeded "official" lists. To users
-- it appears as a prolific author; behind the scenes it's a reserved row in
-- the Better Auth user table that signup blocks from being recreated.

CREATE TABLE IF NOT EXISTS shared_lists (
  id                 SERIAL PRIMARY KEY,
  slug               TEXT UNIQUE NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  icon               TEXT NOT NULL DEFAULT '',
  owner_user_id      TEXT NOT NULL,
  original_list_name TEXT NOT NULL,
  is_published       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  published_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_user_id, original_list_name)
);

CREATE INDEX IF NOT EXISTS shared_lists_published_idx
  ON shared_lists (is_published, sort_order DESC, published_at DESC);

CREATE INDEX IF NOT EXISTS shared_lists_owner_idx
  ON shared_lists (owner_user_id);

CREATE TABLE IF NOT EXISTS shared_items (
  id              SERIAL PRIMARY KEY,
  shared_list_id  INTEGER NOT NULL REFERENCES shared_lists(id) ON DELETE CASCADE,
  category        TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL CHECK (type IN ('todo','bookmark','note','event')),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  url             TEXT,
  priority        INTEGER NOT NULL DEFAULT 2,
  repeat_days     INTEGER NOT NULL DEFAULT 0,
  repeat_months   INTEGER NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS shared_items_list_idx
  ON shared_items (shared_list_id, category, sort_order);

-- Seed the Stash-Squirrel system user. Skips gracefully if Better Auth hasn't
-- created the user table yet (e.g. fresh DB before `auth:migrate`).
DO $$
BEGIN
  IF to_regclass('"user"') IS NOT NULL THEN
    INSERT INTO "user" (id, email, "emailVerified", name, image, "createdAt", "updatedAt", tier)
    VALUES (
      'system-stash-squirrel',
      'stash-squirrel@system.invalid',
      TRUE,
      'Stash Squirrel',
      NULL,
      NOW(),
      NOW(),
      'pro'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
END$$;
