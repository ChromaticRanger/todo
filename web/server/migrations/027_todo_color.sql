-- Per-item colour for calendar rendering. NULL = default (theme accent).
-- Applies to both events and todos; validated against a fixed palette in the
-- API layer (see COLOR_KEYS in server/routes/todos.ts).
ALTER TABLE todos ADD COLUMN IF NOT EXISTS color TEXT;
