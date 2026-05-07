-- Allow 'event' as an item type. Events are Pro-only items that live outside
-- any user list (stored with the sentinel list_name '__events__') and only
-- appear on the Overall Schedule calendar.

-- Drop the conventionally-named constraint if it exists (most installs).
ALTER TABLE todos DROP CONSTRAINT IF EXISTS todos_type_check;

-- Fallback: any other CHECK constraint on todos that restricts `type` to the
-- pre-event set. Matches in any order so we don't depend on PostgreSQL's
-- formatting of the original IN(...) clause.
DO $$
DECLARE
  cname TEXT;
  cdef TEXT;
BEGIN
  FOR cname, cdef IN
    SELECT conname, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'todos'::regclass AND contype = 'c'
  LOOP
    IF cdef ILIKE '%type%'
       AND cdef ILIKE '%bookmark%'
       AND cdef ILIKE '%note%'
       AND cdef NOT ILIKE '%event%'
    THEN
      EXECUTE format('ALTER TABLE todos DROP CONSTRAINT %I', cname);
    END IF;
  END LOOP;
END$$;

ALTER TABLE todos ADD CONSTRAINT todos_type_check
  CHECK (type IN ('todo','bookmark','note','event'));
