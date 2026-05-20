-- Tracks how a user landed on their current tier:
--   'stripe' — set by the Better Auth Stripe webhook callbacks
--   'comp'   — granted by an admin via the Admin Dashboard
-- NULL for accounts that pre-date this column.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "tierSource" TEXT;

-- Backfill: anyone currently on Pro got there via Stripe.
UPDATE "user" SET "tierSource" = 'stripe' WHERE tier = 'pro' AND "tierSource" IS NULL;
