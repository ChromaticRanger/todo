import { Router } from 'express'
import { query } from '../db.js'
import {
  buildTodoSelect,
  coerceTodo,
  fetchOccurrenceOverrides,
  resolveEventOccurrence,
  type TodoRow,
} from './todos.js'

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
    const results = (await resolveEventRows(userId, result.rows)).map(coerceTodo)
    res.json({
      results,
      total: results.length,
      truncated: results.length === limit,
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
