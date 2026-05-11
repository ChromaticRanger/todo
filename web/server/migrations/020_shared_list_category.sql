-- Add a list-level category to shared_lists so the Discover view can filter
-- by theme. Item-level category on shared_items is unchanged.

ALTER TABLE shared_lists
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'Other';

CREATE INDEX IF NOT EXISTS shared_lists_category_idx
  ON shared_lists (category);

-- Backfill the curated Stash-Squirrel lists.
UPDATE shared_lists SET category = 'Sports & Fitness'   WHERE slug = 'stash-sports';
UPDATE shared_lists SET category = 'Food & Drink'       WHERE slug = 'stash-food';
UPDATE shared_lists SET category = 'Travel'             WHERE slug = 'stash-travel';
UPDATE shared_lists SET category = 'Entertainment'      WHERE slug IN ('stash-music', 'stash-movies-tv');
UPDATE shared_lists SET category = 'Technology'         WHERE slug IN ('stash-developer-tools', 'stash-ai-ml', 'stash-design-ux');
UPDATE shared_lists SET category = 'Education'          WHERE slug = 'stash-learning';
UPDATE shared_lists SET category = 'Home & Lifestyle'   WHERE slug = 'stash-household-chores';
UPDATE shared_lists SET category = 'Money & Finance'    WHERE slug = 'stash-finance';
UPDATE shared_lists SET category = 'News & Media'       WHERE slug = 'stash-news';
