import { Router } from 'express'
import { query } from '../db.js'
import { buildTodoSelect, coerceTodo, type TodoRow } from './todos.js'

const router = Router()

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

// GET /api/search?q=<query>&limit=50
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

  const pattern = `%${escapeLike(q)}%`

  try {
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE user_id = $1
           AND type <> 'event'
           AND (title ILIKE $2 OR description ILIKE $2 OR url ILIKE $2)
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
    const results = result.rows.map(coerceTodo)
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
