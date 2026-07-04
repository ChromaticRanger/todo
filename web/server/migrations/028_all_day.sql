-- Explicit all-day flag for events. An all-day event stores its start at local
-- midnight and a duration_seconds that is a whole number of days; this flag lets
-- the client render it in the all-day lane / as a date-only chip without any
-- midnight heuristic. Defaults false so existing timed events are unaffected.
ALTER TABLE todos ADD COLUMN IF NOT EXISTS all_day BOOLEAN NOT NULL DEFAULT false;
