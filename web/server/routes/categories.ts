import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// GET /api/categories?list=X
router.get('/', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  try {
    const result = await query<{ category: string }>(
      'SELECT DISTINCT category FROM todos WHERE list_name = $1 AND status = 0 ORDER BY category',
      [list]
    )
    res.json({ categories: result.rows.map((r) => r.category) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
