-- Blog / product-updates feature.
--
-- Global, admin-authored posts (written in Markdown, uploaded from the Admin
-- Dashboard). Like `shared_lists` (007) this is NOT user-scoped content — there
-- is no per-user insert path, so the table carries no `user_id`. Attribution is
-- kept as the author's email for the record only.
--
-- Reactions ARE user-scoped, but only for de-duplication: one row per
-- (post, user, reaction) lets a reader toggle 👍 and ❤️ independently.

CREATE TABLE IF NOT EXISTS blog_posts (
  id           SERIAL PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',       -- short teaser for the list view
  body         TEXT NOT NULL,                  -- raw markdown
  author_email TEXT NOT NULL DEFAULT '',       -- attribution, from req.adminEmail
  is_published BOOLEAN NOT NULL DEFAULT FALSE,  -- uploads start as drafts
  published_at TIMESTAMPTZ,                    -- set the first time it is published
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS blog_posts_published_idx
  ON blog_posts (is_published, published_at DESC);

CREATE TABLE IF NOT EXISTS blog_post_reactions (
  post_id    INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL,
  reaction   TEXT NOT NULL CHECK (reaction IN ('like','love')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS blog_post_reactions_post_idx
  ON blog_post_reactions (post_id);
