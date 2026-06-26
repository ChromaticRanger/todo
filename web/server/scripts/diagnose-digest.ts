/**
 * READ-ONLY diagnostic for the daily digest. Inspects one user's opt-in,
 * timezone, digest_log history, and what the digest would currently contain.
 * Usage: ALLOW_REMOTE_DB=1 tsx --env-file=.env.production server/scripts/diagnose-digest.ts <email>
 */
import dotenv from 'dotenv'
if (process.env.ALLOW_REMOTE_DB !== '1') {
  delete process.env.DATABASE_URL
}
dotenv.config()

const EMAIL = process.argv[2] || 'mds1966@gmail.com'

function isValidTz(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true } catch { return false }
}
function localHour(tz: string, nowMs: number): number {
  const t = isValidTz(tz) ? tz : 'UTC'
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: t, hour12: false, hour: '2-digit' })
      .formatToParts(new Date(nowMs)).find((p) => p.type === 'hour')!.value
  ) % 24
}

async function main() {
  const { pool, query } = await import('../db.js')
  try {
    const u = await query<{ id: string; email: string; name: string | null }>(
      'SELECT id, email, name FROM "user" WHERE lower(email) = lower($1)',
      [EMAIL]
    )
    if (u.rowCount === 0) {
      console.log(`No user found for ${EMAIL}`)
      return
    }
    const user = u.rows[0]
    console.log('USER:', user)

    const prefs = await query<{ value: Record<string, unknown> }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'preferences'`,
      [user.id]
    )
    console.log('PREFERENCES row:', prefs.rows[0]?.value ?? '(none)')

    const tz = (prefs.rows[0]?.value?.timezone as string) || 'UTC'
    const nowMs = Date.now()
    console.log('Server now (UTC):', new Date(nowMs).toISOString())
    console.log('Stored timezone:', tz, '| current local hour there:', localHour(tz, nowMs))

    const log = await query<{ sent_on: string; sent_at: string }>(
      'SELECT sent_on, sent_at FROM digest_log WHERE user_id = $1 ORDER BY sent_on DESC LIMIT 8',
      [user.id]
    )
    console.log('digest_log (recent):', log.rows)

    // Count what the candidate query would match (across all users).
    const cand = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM "user" u
       JOIN app_settings s ON s.user_id = u.id AND s.key = 'preferences'
       WHERE (s.value->>'dailyEmailDigest') = 'true'
         AND u.email IS NOT NULL AND u.id NOT LIKE 'demo-%'`
    )
    console.log('Total opted-in candidates:', cand.rows[0].n)

    // What the digest would contain right now (read-only).
    const { getDueAndOverdue } = await import('../lib/digest.js')
    // Reproduce local-day start the same way the job does, via the helper path:
    // compute via a quick offset trick.
    const offsetMs =
      (() => {
        const t = isValidTz(tz) ? tz : 'UTC'
        const dtf = new Intl.DateTimeFormat('en-US', {
          timeZone: t, hour12: false,
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
        const p = dtf.formatToParts(new Date(nowMs))
        const g = (k: string) => Number(p.find((x) => x.type === k)!.value)
        let h = g('hour'); if (h === 24) h = 0
        return Date.UTC(g('year'), g('month') - 1, g('day'), h, g('minute'), g('second')) - nowMs
      })()
    const local = new Date(nowMs + offsetMs)
    const midnightWall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0)
    const dayStart = Math.floor((midnightWall - offsetMs) / 1000)
    const groups = await getDueAndOverdue(user.id, dayStart)
    console.log('Would contain — overdue:', groups.overdue.length, 'today:', groups.today.length)
    console.log('  overdue:', groups.overdue)
    console.log('  today:', groups.today)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
