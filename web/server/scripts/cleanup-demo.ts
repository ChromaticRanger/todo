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
 *
 * The deployed app also runs this on its own daily schedule (see
 * lib/scheduler.ts); this CLI stays for one-off and local runs. The actual
 * deletion lives in lib/demoCleanup.ts so the two can't drift apart.
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
  const { cleanupDemoUsers } = await import('../lib/demoCleanup.js')
  const { pool } = await import('../db.js')
  try {
    const { deleted } = await cleanupDemoUsers()
    console.log(`\u2713 Deleted ${deleted} ephemeral demo user(s)`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
