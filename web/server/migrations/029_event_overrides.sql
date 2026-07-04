-- Per-occurrence overrides for recurring events. A recurring event is stored as
-- one series row and expanded on read; an override lets a single occurrence be
-- moved/resized ("this occurrence") without splitting the series. Keyed by the
-- ORIGINAL occurrence start (the cadence-generated time), so it stays stable as
-- the occurrence is re-expanded.
CREATE TABLE IF NOT EXISTS event_overrides (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              TEXT   NOT NULL,
  series_id            BIGINT NOT NULL,
  occurrence_start     BIGINT NOT NULL,
  new_due_date         BIGINT,
  new_duration_seconds BIGINT,
  UNIQUE (series_id, occurrence_start)
);

CREATE INDEX IF NOT EXISTS event_overrides_user_series_idx
  ON event_overrides (user_id, series_id);
