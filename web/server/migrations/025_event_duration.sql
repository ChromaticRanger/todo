-- Events become time blocks: each event spans [due_date, due_date + duration_seconds).
-- NULL means a legacy point-in-time event (renders as just a start time).
-- The 14-day upper bound is enforced in the route layer so it can change
-- without a migration.

ALTER TABLE todos ADD COLUMN IF NOT EXISTS duration_seconds BIGINT;
