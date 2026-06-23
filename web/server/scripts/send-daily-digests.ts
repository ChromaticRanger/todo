/**
 * Send the daily reminder digest (overdue + due today) to every opted-in user.
 *
 * In production this is normally triggered by the scheduled GitHub Actions
 * workflow hitting POST /api/cron/daily-digest. This script is the same job run
 * directly against the DB — handy for local testing (emails fall back to the
 * console when RESEND_API_KEY is unset) and as a manual fallback.
 *
 * Usage: `npm run digest:send` (local) or `npm run digest:send:prod`.
 *
 * Idempotent per UTC day via the digest_log table, so it's safe to re-run.
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
    console.log(`→ Sending digests against local DB (${host})`)
    return
  }
  if (process.env.ALLOW_REMOTE_DB === '1') {
    console.log(`→ Sending digests against REMOTE DB (${host}) — ALLOW_REMOTE_DB is set`)
    return
  }
  console.error(`Refusing to run: DATABASE_URL points at ${host}, not localhost.`)
  process.exit(1)
}

async function main() {
  guardTargetDb()
  // Import after env is set up so db.ts reads the right DATABASE_URL.
  const { runDailyDigests } = await import('../lib/digest.js')
  const { pool } = await import('../db.js')
  try {
    const summary = await runDailyDigests()
    console.log('✓ Digest run complete:', summary)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
