-- Idempotency ledger for the daily email digest. One row per (user, UTC day)
-- the digest was actually sent, so re-running the job the same day — whether a
-- scheduled run, a manual GitHub Actions trigger, or a catch-up — never emails
-- anyone twice. The (user_id, sent_on) primary key is the dedupe guard; the job
-- claims a slot here before sending and removes it again if there was nothing
-- to send or the send failed.

CREATE TABLE IF NOT EXISTS digest_log (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  sent_on DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sent_on)
);
