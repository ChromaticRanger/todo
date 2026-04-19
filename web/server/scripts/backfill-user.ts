/**
 * One-shot migration: claim all pre-existing multi-tenant data for a given user.
 *
 * Run AFTER:
 *   1. `npx @better-auth/cli migrate`  (creates user/session/account/verification)
 *   2. The SQL in server/migrations/003_multi_tenant.sql has been applied
 *   3. The target user has signed up via the UI
 *
 * Usage:  npx tsx server/scripts/backfill-user.ts <email>
 */

import 'dotenv/config'
import { pool } from '../db.js'

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: npx tsx server/scripts/backfill-user.ts <email>')
    process.exit(1)
  }

  const client = await pool.connect()
  try {
    // Look up the user — Better Auth's table is lowercase "user".
    const userRes = await client.query<{ id: string }>(
      'SELECT id FROM "user" WHERE email = $1',
      [email]
    )
    if (userRes.rowCount === 0) {
      console.error(`No user found with email "${email}". Sign up first, then retry.`)
      process.exit(1)
    }
    const userId = userRes.rows[0].id
    console.log(`Found user id: ${userId}`)

    await client.query('BEGIN')

    const todosUpdate = await client.query(
      'UPDATE todos SET user_id = $1 WHERE user_id IS NULL',
      [userId]
    )
    console.log(`  todos: claimed ${todosUpdate.rowCount} row(s)`)

    const settingsUpdate = await client.query(
      'UPDATE app_settings SET user_id = $1 WHERE user_id IS NULL',
      [userId]
    )
    console.log(`  app_settings: claimed ${settingsUpdate.rowCount} row(s)`)

    // Tighten schema once no NULLs remain.
    console.log('Tightening schema…')

    await client.query('ALTER TABLE todos ALTER COLUMN user_id SET NOT NULL')
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'todos_user_id_fkey'
        ) THEN
          ALTER TABLE todos
            ADD CONSTRAINT todos_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
        END IF;
      END$$;
    `)

    await client.query('ALTER TABLE app_settings ALTER COLUMN user_id SET NOT NULL')
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'app_settings_user_id_fkey'
        ) THEN
          ALTER TABLE app_settings
            ADD CONSTRAINT app_settings_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
        END IF;
      END$$;
    `)

    // Swap app_settings PK from (key) to (user_id, key).
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'app_settings_pkey'
            AND pg_get_constraintdef(oid) = 'PRIMARY KEY (key)'
        ) THEN
          ALTER TABLE app_settings DROP CONSTRAINT app_settings_pkey;
          ALTER TABLE app_settings ADD PRIMARY KEY (user_id, key);
        END IF;
      END$$;
    `)

    await client.query('COMMIT')
    console.log('Backfill complete.')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Backfill failed:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
