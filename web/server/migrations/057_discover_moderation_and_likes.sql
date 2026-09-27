-- Discover moderation and likes.
--
-- Two additions to the public catalogue, done together because they share a
-- shape: a join table keyed on (shared_list, user) plus an aggregate read on
-- the browse path.
--
-- MODERATION. Until now the only way to take a published list down was
-- DELETE /api/shared/lists/:slug, which is owner-only — an admin had no way to
-- remove someone else's submission and a reader had no way to flag one.
--
-- `is_hidden` is a NEW column rather than a reuse of `is_published`, which
-- looks like the obvious switch but is vestigial: it is set TRUE on insert,
-- set TRUE again by the republish UPDATE in routes/shared.ts, and never set
-- FALSE anywhere — "unpublish" is a hard DELETE. Conflating the two would mean
-- a publisher republishing silently clears a moderator's decision. Keeping
-- them separate also means the republish path needs no change at all: a hidden
-- list that gets republished stays hidden, which is the behaviour we want,
-- since the publisher is deliberately not told.
--
-- LIKES. The catalogue had no quality signal, so ordering was pure recency
-- beneath the curated lists (which pin via sort_order = 1000). A like count
-- gives readers a "Most liked" sort that compounds as the catalogue grows.

ALTER TABLE shared_lists ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- The browse path is "visible lists, newest-ish first". Partial so the hidden
-- rows stay out of the index entirely rather than widening the existing
-- shared_lists_published_idx.
CREATE INDEX IF NOT EXISTS shared_lists_visible_idx
  ON shared_lists (sort_order DESC, published_at DESC)
  WHERE is_hidden = FALSE;

CREATE TABLE IF NOT EXISTS shared_list_reports (
  id               BIGSERIAL   PRIMARY KEY,
  shared_list_id   INTEGER     NOT NULL REFERENCES shared_lists(id) ON DELETE CASCADE,
  -- Nullable, ON DELETE SET NULL: a report has to outlive the reporter closing
  -- their account. With CASCADE, deleting your account would erase the reports
  -- you filed — but worse, it hands anyone a way to wipe the evidence trail.
  reporter_user_id TEXT        REFERENCES "user"(id) ON DELETE SET NULL,
  reason           TEXT        NOT NULL CHECK (reason IN ('spam','offensive','broken','other')),
  detail           TEXT        NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  -- The admin's email, not a user id: requireAdmin resolves a session and
  -- exposes req.adminEmail without an id, and every other admin audit line in
  -- routes/admin.ts records the same thing.
  resolved_by      TEXT,
  -- One report per person per list. Cheaper than a rate limiter, and lets the
  -- insert be ON CONFLICT DO NOTHING so a repeat submit is idempotent and
  -- reveals nothing about whether a report already existed.
  UNIQUE (shared_list_id, reporter_user_id)
);

-- The admin queue reads open reports (resolved_at IS NULL), newest first.
CREATE INDEX IF NOT EXISTS shared_list_reports_open_idx
  ON shared_list_reports (resolved_at, created_at DESC);

CREATE TABLE IF NOT EXISTS shared_list_likes (
  shared_list_id INTEGER     NOT NULL REFERENCES shared_lists(id) ON DELETE CASCADE,
  -- Unlike blog_post_reactions (migration 030), this carries a real FK. That
  -- table's user_id is bare TEXT, so its rows outlive deleted accounts and the
  -- counts drift upward forever. A like here is a ranking signal, so it has to
  -- stay honest — particularly with ephemeral demo users being swept every 24
  -- hours by lib/demoCleanup.ts.
  user_id        TEXT        NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shared_list_id, user_id)
);

-- Hot path: the per-list COUNT(*) on every browse.
CREATE INDEX IF NOT EXISTS shared_list_likes_list_idx
  ON shared_list_likes (shared_list_id);
