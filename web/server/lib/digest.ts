import { query } from '../db.js'
import {
  buildTodoSelect,
  coerceTodo,
  fetchExpandedEventSeries,
  type TodoRow,
} from '../routes/todos.js'
import { sendDigestEmailFor, type DigestItem } from './email.js'

// Local hour at which the digest goes out, in each user's own timezone.
// Override with DIGEST_SEND_HOUR (0–23) if you ever want a different time.
const SEND_HOUR = (() => {
  const h = Number(process.env.DIGEST_SEND_HOUR)
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 7
})()

// ── Timezone helpers (no dependencies — Node 22 ships full ICU) ──────────────

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// (local wall-clock − UTC) in ms for the given instant in `tz`.
function tzOffsetMs(tz: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  let hour = get('hour')
  if (hour === 24) hour = 0 // some ICU builds emit "24" for midnight
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return asUTC - utcMs
}

interface ZonedNow {
  /** Local hour 0–23. */
  hour: number
  /** Local calendar date as YYYY-MM-DD — the digest_log dedupe key. */
  dateStr: string
  /** Epoch seconds of the most recent local midnight (start of the local day). */
  dayStartSec: number
}

// Resolve the current local hour, local date, and local-day-start for a tz.
// Invalid/unknown timezones fall back to UTC so the digest still goes out.
function zonedNow(tzRaw: string | null, nowMs: number): ZonedNow {
  const tz = tzRaw && isValidTz(tzRaw) ? tzRaw : 'UTC'
  const offset = tzOffsetMs(tz, nowMs)
  // A Date whose UTC fields read as the local wall clock.
  const local = new Date(nowMs + offset)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  const d = local.getUTCDate()
  const hour = local.getUTCHours()
  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = `${y}-${pad(m + 1)}-${pad(d)}`
  // UTC instant of local midnight. Apply the offset twice so a DST change
  // between midnight and now doesn't skew the boundary.
  const midnightWall = Date.UTC(y, m, d, 0, 0, 0)
  let utcMidnight = midnightWall - tzOffsetMs(tz, midnightWall)
  utcMidnight = midnightWall - tzOffsetMs(tz, utcMidnight)
  return { hour, dateStr, dayStartSec: Math.floor(utcMidnight / 1000) }
}

// ── Data ─────────────────────────────────────────────────────────────────────

// Events live under a sentinel list name; never surface that to the user.
function listLabel(t: { type: string; list_name: string }): string | null {
  if (t.type === 'event' || t.list_name === '__events__') return null
  return t.list_name
}

function toDigestItem(t: ReturnType<typeof coerceTodo>): DigestItem {
  return { title: t.title, list: listLabel(t), due: t.due_date }
}

/**
 * Everything due today plus everything overdue, across all of a user's lists,
 * for the local day starting at `dayStart` (epoch seconds). Events are included
 * for today (one-off and expanded recurring) but never count as overdue (a past
 * event has happened).
 */
export async function getDueAndOverdue(
  userId: string,
  dayStart: number
): Promise<{ overdue: DigestItem[]; today: DigestItem[] }> {
  const to = dayStart + 86400

  const [main, series] = await Promise.all([
    query<TodoRow>(
      buildTodoSelect(
        `WHERE user_id = $1 AND status = 0
         AND due_date IS NOT NULL
         AND (
           (type = 'todo' AND due_date >= $2 AND due_date < $3)
           OR (type = 'event' AND repeat_days = 0 AND repeat_months = 0
               AND due_date < $3
               AND (due_date + COALESCE(duration_seconds, 0)) > $2)
           OR (type = 'todo' AND due_date < $2)
         )
         ORDER BY due_date ASC`
      ),
      [userId, dayStart, to]
    ),
    fetchExpandedEventSeries(userId, dayStart, to),
  ])

  const merged = [...main.rows, ...series].map(coerceTodo)
  merged.sort((a, b) => (a.due_date ?? 0) - (b.due_date ?? 0))

  const overdue: DigestItem[] = []
  const today: DigestItem[] = []
  for (const t of merged) {
    if (t.type === 'todo' && t.due_date != null && t.due_date < dayStart) {
      overdue.push(toDigestItem(t))
    } else {
      today.push(toDigestItem(t))
    }
  }
  return { overdue, today }
}

export interface DigestRunSummary {
  candidates: number
  sent: number
  skippedEmpty: number
  skippedHour: number
  alreadySent: number
  failed: number
}

interface DigestUser {
  id: string
  email: string
  name: string | null
  timezone: string | null
}

/**
 * Send the daily digest to opted-in users for whom it's currently ~SEND_HOUR
 * local time (this is why the workflow runs hourly). "Today"/"overdue" are
 * computed in each user's local day, and the digest_log dedupe key is their
 * local date, so everyone gets exactly one email per local day.
 *
 * Idempotent: each user's slot is claimed before sending and released again if
 * there was nothing to send or the send failed, so re-runs never double-email.
 *
 * `force` bypasses the local-hour gate (used by the manual workflow trigger for
 * testing) — the per-day dedupe still applies.
 */
export async function runDailyDigests(opts: { force?: boolean } = {}): Promise<DigestRunSummary> {
  const force = !!opts.force
  const nowMs = Date.now()

  const { rows: users } = await query<DigestUser>(
    `SELECT u.id, u.email, u.name, s.value->>'timezone' AS timezone
     FROM "user" u
     JOIN app_settings s ON s.user_id = u.id AND s.key = 'preferences'
     WHERE (s.value->>'dailyEmailDigest') = 'true'
       AND u.email IS NOT NULL
       AND u.id NOT LIKE 'demo-%'`
  )

  const summary: DigestRunSummary = {
    candidates: users.length,
    sent: 0,
    skippedEmpty: 0,
    skippedHour: 0,
    alreadySent: 0,
    failed: 0,
  }

  for (const user of users) {
    const zoned = zonedNow(user.timezone, nowMs)

    // Only deliver during the user's local send hour (unless forced).
    if (!force && zoned.hour !== SEND_HOUR) {
      summary.skippedHour++
      continue
    }

    const sentOn = zoned.dateStr

    // Claim the slot first. ON CONFLICT DO NOTHING makes this the dedupe guard:
    // only one run per (user, local day) gets a row back.
    const claim = await query(
      `INSERT INTO digest_log (user_id, sent_on) VALUES ($1, $2)
       ON CONFLICT (user_id, sent_on) DO NOTHING
       RETURNING user_id`,
      [user.id, sentOn]
    )
    if (claim.rowCount === 0) {
      summary.alreadySent++
      continue
    }

    try {
      const groups = await getDueAndOverdue(user.id, zoned.dayStartSec)
      if (groups.overdue.length === 0 && groups.today.length === 0) {
        // Nothing to say — release the slot so a later run can still send if the
        // user adds something for today.
        await query('DELETE FROM digest_log WHERE user_id = $1 AND sent_on = $2', [user.id, sentOn])
        summary.skippedEmpty++
        continue
      }
      await sendDigestEmailFor(user, groups)
      summary.sent++
    } catch (err) {
      console.error('[digest] failed for', user.id, err)
      // Release the slot so the failure can be retried on the next run.
      await query('DELETE FROM digest_log WHERE user_id = $1 AND sent_on = $2', [user.id, sentOn]).catch(
        () => {}
      )
      summary.failed++
    }
  }

  return summary
}
