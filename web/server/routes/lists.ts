import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// GET /api/lists — all distinct list names for this user
router.get('/', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ list_name: string }>(
      'SELECT DISTINCT list_name FROM todos WHERE user_id = $1 ORDER BY list_name',
      [userId]
    )
    res.json({ lists: result.rows.map((r) => r.list_name) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/lists/:name — rename a list
router.patch('/:name', async (req, res) => {
  const userId = req.userId!
  const { name: newName } = req.body as { name?: string }
  if (!newName || !newName.trim()) {
    res.status(400).json({ error: 'New name is required' })
    return
  }
  try {
    await query(
      'UPDATE todos SET list_name = $1 WHERE list_name = $2 AND user_id = $3',
      [newName.trim(), req.params.name, userId]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/lists/:name — delete all todos in a list
router.delete('/:name', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query(
      'DELETE FROM todos WHERE list_name = $1 AND user_id = $2',
      [req.params.name, userId]
    )
    res.json({ deleted: result.rowCount })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
