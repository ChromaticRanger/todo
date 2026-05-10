-- Index for time-windowed views (today/week/month/overdue/schedule/calendar/counts)
-- which all filter by user_id + a due_date range. Without this, those queries
-- use the user_id index then post-filter by due_date.
--
-- Plain CREATE INDEX briefly takes a write lock on todos. The migration runner
-- wraps each file in a transaction, which precludes CONCURRENTLY; the table is
-- small enough that the lock is negligible.

CREATE INDEX IF NOT EXISTS todos_user_due_date_idx
  ON todos(user_id, due_date)
  WHERE due_date IS NOT NULL;
