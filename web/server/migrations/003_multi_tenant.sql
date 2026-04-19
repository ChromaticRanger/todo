-- Add user_id columns (nullable for now — backfill script tightens to NOT NULL + FK
-- after an initial user exists and existing rows have been claimed).

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS todos_user_id_idx ON todos(user_id);
CREATE INDEX IF NOT EXISTS todos_user_list_idx ON todos(user_id, list_name);

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS user_id TEXT;
