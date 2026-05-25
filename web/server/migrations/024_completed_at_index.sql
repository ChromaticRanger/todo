-- Index for the Completed view, which filters by user + list + status=1 + type='todo'
-- and orders by completed_at DESC. Without this, large completion histories trigger
-- a sort on every fetch. Partial-indexing on (status=1, type='todo') keeps it tiny.

CREATE INDEX IF NOT EXISTS todos_user_list_completed_idx
  ON todos(user_id, list_name, completed_at DESC)
  WHERE status = 1 AND type = 'todo';
