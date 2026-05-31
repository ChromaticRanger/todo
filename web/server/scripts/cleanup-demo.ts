/**
 * Delete ephemeral demo users (and their cascaded data) older than 24 hours.
 *
 * Each /api/demo/start mints a `demo-<uuid>` user with cloned seed data and
 * the visitor's session writes accumulate against it. They never sign in
 * again — Better Auth's session expiry would tidy the session row, but the
 * user/account/todos rows would linger. This script garbage-collects them.
 *
 * The seeded template (`demo-user`) is preserved.
 *
 * Usage: `npm run cleanup:demo` (local) or `npm run cleanup:demo:prod`.
 * Run periodically — once a day is plenty for the expected volume.
 */
import dotenv from 'dotenv'
if (process.env.ALLOW_REMOTE_DB !== '1') {
  delete process.env.DATABASE_URL
}
dotenv.config()

function guardTargetDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (isLocal) {
    console.log(`→ Cleaning local DB (${host})`)
    return
  }
  if (process.env.ALLOW_REMOTE_DB === '1') {
    console.log(`→ Cleaning REMOTE DB (${host}) — ALLOW_REMOTE_DB is set`)
    return
  }
  console.error(`Refusing to clean: DATABASE_URL points at ${host}, not localhost.`)
  process.exit(1)
}

async function main() {
  guardTargetDb()
  const { pool } = await import('../db.js')
  const client = await pool.connect()
  try {
    // CASCADE on the user FK cleans up session, account, todos, app_settings,
    // and shared_lists rows for the deleted ephemeral users. Demos that are
    // parked by a pending_demo_carryover row are excluded — they're waiting
    // for a signed-up visitor to pick their plan.
    const result = await client.query<{ id: string }>(
      `DELETE FROM "user"
        WHERE id LIKE 'demo-%'
          AND id <> 'demo-user'
          AND "createdAt" < NOW() - INTERVAL '24 hours'
          AND id NOT IN (
            SELECT value->>'demoUserId' FROM app_settings
             WHERE key = 'pending_demo_carryover'
          )
        RETURNING id`
    )
    console.log(`✓ Deleted ${result.rowCount ?? 0} ephemeral demo user(s)`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
