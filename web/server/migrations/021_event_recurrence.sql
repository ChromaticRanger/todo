-- Recurring events: a single series row stays in `todos`; occurrences are
-- expanded virtually on read inside the requested date window. The new column
-- `recur_until` (nullable epoch seconds) bounds an otherwise-infinite series.
--
-- We deliberately don't add a separate frequency column — v1 reuses the existing
-- `repeat_days` / `repeat_months` columns with three accepted presets:
--   weekly  → repeat_days = 7
--   monthly → repeat_months = 1
--   yearly  → repeat_months = 12

ALTER TABLE todos ADD COLUMN IF NOT EXISTS recur_until BIGINT NULL;

-- Read endpoints fetch every active recurring event series for the user so they
-- can be expanded in-memory. A partial index keeps that lookup cheap regardless
-- of how many todos the user owns.
CREATE INDEX IF NOT EXISTS todos_event_series_idx
  ON todos (user_id)
  WHERE type = 'event' AND (repeat_days > 0 OR repeat_months > 0);
