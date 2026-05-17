-- Add the missing FK from shared_lists.owner_user_id → "user"(id) with
-- ON DELETE CASCADE so deleting a user also removes their published
-- Discovery lists (and, via the existing cascade on shared_items, their
-- items). Before deletion this was the one place a user's data could be
-- orphaned in the database.

-- Defensive: drop any rows whose owner has already vanished. The dormant-user
-- cleanup script can't strand shared_lists today (it requires zero todos, and
-- you can't publish without todos) but the FK requires a clean state to add.
DELETE FROM shared_lists
WHERE owner_user_id NOT IN (SELECT id FROM "user");

ALTER TABLE shared_lists
  ADD CONSTRAINT shared_lists_owner_user_id_fkey
  FOREIGN KEY (owner_user_id) REFERENCES "user"(id) ON DELETE CASCADE;
