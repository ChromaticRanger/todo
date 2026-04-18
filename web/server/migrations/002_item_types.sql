ALTER TABLE todos ADD COLUMN type text NOT NULL DEFAULT 'todo'
  CHECK (type IN ('todo','bookmark','note'));
CREATE INDEX IF NOT EXISTS todos_type_idx ON todos(type);
