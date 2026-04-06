import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// GET /api/lists — all distinct list names
router.get('/', async (_req, res) => {
  try {
    const result = await query<{ list_name: string }>(
      'SELECT DISTINCT list_name FROM todos ORDER BY list_name'
    )
    res.json({ lists: result.rows.map((r) => r.list_name) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/lists/:name — delete all todos in a list
router.delete('/:name', async (req, res) => {
  try {
    const result = await query('DELETE FROM todos WHERE list_name = $1', [req.params.name])
    res.json({ deleted: result.rowCount })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
