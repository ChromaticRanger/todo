import { Router } from 'express'
import { query } from '../db.js'
import {
  buildTodoSelect,
  coerceTodo,
  fetchOccurrenceOverrides,
  resolveEventOccurrence,
  type TodoRow,
} from './todos.js'
import { fetchSharedScope, sharedScopeParams, displayNameFor } from '../lib/listAccess.js'

const router = Router()

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// Events are stored as a single series row anchored on their first occurrence,
// so a matched recurring event carries a due_date that may be long past. Rewrite
// each event row onto the occurrence the client should jump to — the next one, or
// the last if the series has ended — mirroring the shape of an expanded
// occurrence (`occurrence_start` = the cadence-generated start) so the calendar's
// highlight key matches the chip it actually renders.
async function resolveEventRows(userId: string, rows: TodoRow[]): Promise<TodoRow[]> {
  const seriesIds = rows
    .filter((r) => r.type === 'event' && (Number(r.repeat_days) > 0 || Number(r.repeat_months) > 0))
    .map((r) => Number(r.id))
  if (rows.every((r) => r.type !== 'event')) return rows

  const overrides = await fetchOccurrenceOverrides(userId, seriesIds)
  const now = Math.floor(Date.now() / 1000)

  return rows.map((row) => {
    if (row.type !== 'event') return row
    const occ = resolveEventOccurrence(row, now)
    if (occ == null) return row
    const ov = overrides?.get(`${Number(row.id)}:${occ}`)
    return {
      ...row,
      due_date: ov?.due ?? occ,
      duration_seconds: ov?.dur ?? row.duration_seconds,
      occurrence_start: occ,
    }
  })
}

// GET /api/search?q=<query>&limit=50&includeCompleted=1
router.get('/', async (req, res) => {
  if (req.plan !== 'pro') {
    res.status(403).json({ error: 'pro_required' })
    return
  }

  const userId = req.userId!
  const raw = (req.query.q as string | undefined) ?? ''
  const q = raw.trim()

  if (q.length < 2) {
    res.json({ results: [], total: 0, truncated: false })
    return
  }

  let limit = Number.parseInt((req.query.limit as string | undefined) ?? '', 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT
  if (limit > MAX_LIMIT) limit = MAX_LIMIT

  // Completed items are excluded by default — search is overwhelmingly about
  // finding live work. The client opts back in from the Settings toggle.
  const includeCompleted = req.query.includeCompleted === '1'

  const pattern = `%${escapeLike(q)}%`

  try {
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE user_id = $1
           AND (title ILIKE $2 OR description ILIKE $2 OR url ILIKE $2)
           ${includeCompleted ? '' : 'AND status = 0'}
         ORDER BY
           (CASE WHEN title ILIKE $2 THEN 0
                 WHEN description ILIKE $2 THEN 1
                 ELSE 2 END),
           status ASC,
           created_at DESC
         LIMIT $3`
      ),
      [userId, pattern, limit]
    )
    const own = (await resolveEventRows(userId, result.rows)).map(coerceTodo)

    // Lists shared with this user are searched separately and merged, rather
    // than widening the query above to span owners — the `user_id = $1` prefix
    // is what keeps that one on its index. No-op for anyone with no shares.
    const scope = await fetchSharedScope(userId)
    let shared: Array<ReturnType<typeof coerceTodo> & Record<string, unknown>> = []
    if (scope.length > 0) {
      const [owners, names] = sharedScopeParams(scope)
      const sharedRes = await query<TodoRow & { user_id: string }>(
        `SELECT id, user_id, list_name, title, description, category, priority, status,
           EXTRACT(EPOCH FROM created_at)::BIGINT AS created_at,
           EXTRACT(EPOCH FROM completed_at)::BIGINT AS completed_at,
           due_date, repeat_days, repeat_months, spawned_next, type, url, snoozed_until,
           recur_until, duration_seconds, color, all_day
         FROM todos
         WHERE (user_id, list_name) IN (
           SELECT * FROM unnest($1::text[], $2::text[])
         )
         AND type <> 'event'
         AND (title ILIKE $3 OR description ILIKE $3 OR url ILIKE $3)
         ${includeCompleted ? '' : 'AND status = 0'}
         ORDER BY
           (CASE WHEN title ILIKE $3 THEN 0
                 WHEN description ILIKE $3 THEN 1
                 ELSE 2 END),
           status ASC,
           created_at DESC
         LIMIT $4`,
        [owners, names, pattern, limit]
      )
      const byPair = new Map(scope.map((r) => [`${r.ownerId}\u0000${r.listName}`, r]))
      const ownerNames = new Map<string, string>()
      for (const ownerId of new Set(scope.map((r) => r.ownerId))) {
        ownerNames.set(ownerId, await displayNameFor(ownerId))
      }
      shared = sharedRes.rows.map((row) => {
        const ref = byPair.get(`${row.user_id}\u0000${row.list_name}`)
        const { user_id: _o, ...rest } = row
        return {
          ...coerceTodo(rest as TodoRow),
          list_key: ref ? `@${ref.collabId}` : undefined,
          collab_id: ref?.collabId,
          owner_name: ref ? ownerNames.get(ref.ownerId) ?? null : null,
          can_write: ref ? ref.role === 'editor' : false,
        }
      })
    }

    // Re-rank the combined set on the same terms the SQL used, then clip —
    // otherwise a shared match could never displace a weaker own-list one.
    const rank = (t: { title: string; description: string; status: number }) =>
      t.title.toLowerCase().includes(q.toLowerCase()) ? 0
        : (t.description ?? '').toLowerCase().includes(q.toLowerCase()) ? 1 : 2
    const merged = [...own, ...shared].sort((a, b) => {
      const r = rank(a) - rank(b)
      if (r !== 0) return r
      if (a.status !== b.status) return a.status - b.status
      return (b.created_at ?? 0) - (a.created_at ?? 0)
    })
    const results = merged.slice(0, limit)

    res.json({
      results,
      total: results.length,
      truncated: merged.length > limit,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
