ALTER TABLE todos ADD COLUMN IF NOT EXISTS snoozed_until BIGINT;
CREATE INDEX IF NOT EXISTS todos_snoozed_until_idx ON todos(snoozed_until);
