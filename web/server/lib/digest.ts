import { query } from '../db.js'
import {
  buildTodoSelect,
  coerceTodo,
  fetchExpandedEventSeries,
  type TodoRow,
} from '../routes/todos.js'
import { sendDigestEmailFor, type DigestItem } from './email.js'

// Events live under a sentinel list name; never surface that to the user.
function listLabel(t: { type: string; list_name: string }): string | null {
  if (t.type === 'event' || t.list_name === '__events__') return null
  return t.list_name
}

function toDigestItem(t: ReturnType<typeof coerceTodo>): DigestItem {
  return { title: t.title, list: listLabel(t), due: t.due_date }
}

/**
 * Everything due today plus everything overdue, across all of a user's lists.
 * "Today" uses UTC day boundaries — the same windowing as the in-app Today
 * view and /api/todos/today/all. Events are included for today (one-off and
 * expanded recurring) but never count as overdue (a past event has happened).
 */
export async function getDueAndOverdue(
  userId: string
): Promise<{ overdue: DigestItem[]; today: DigestItem[] }> {
  const now = Math.floor(Date.now() / 1000)
  const dayStart = Math.floor(now / 86400) * 86400
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
  alreadySent: number
  failed: number
}

interface DigestUser {
  id: string
  email: string
  name: string | null
}

/**
 * Send the daily digest to every user who opted in. Idempotent per UTC day via
 * the digest_log table: each user's slot is claimed before sending, and released
 * again if there was nothing to send or the send failed, so a re-run (scheduled,
 * manual, or catch-up) never double-emails anyone.
 */
export async function runDailyDigests(): Promise<DigestRunSummary> {
  const now = Math.floor(Date.now() / 1000)
  const dayStart = Math.floor(now / 86400) * 86400
  // YYYY-MM-DD for today's UTC day — the digest_log dedupe key.
  const sentOn = new Date(dayStart * 1000).toISOString().slice(0, 10)

  const { rows: users } = await query<DigestUser>(
    `SELECT u.id, u.email, u.name
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
    alreadySent: 0,
    failed: 0,
  }

  for (const user of users) {
    // Claim the slot first. ON CONFLICT DO NOTHING makes this the dedupe guard:
    // only one run per (user, day) gets a row back.
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
      const groups = await getDueAndOverdue(user.id)
      if (groups.overdue.length === 0 && groups.today.length === 0) {
        // Nothing to say — release the slot so a later run can still send if the
        // user adds something today.
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
