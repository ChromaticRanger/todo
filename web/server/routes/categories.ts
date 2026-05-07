import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// GET /api/categories?list=X
router.get('/', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    const result = await query<{ category: string }>(
      `SELECT DISTINCT category FROM todos
       WHERE user_id = $1 AND list_name = $2 AND status = 0
         AND type <> 'event'
       ORDER BY category`,
      [userId, list]
    )
    res.json({ categories: result.rows.map((r) => r.category) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/categories/move-items — move every todo in `fromName` to `toName`
router.post('/move-items', async (req, res) => {
  const userId = req.userId!
  const { list, fromName, toName } = req.body as { list?: string; fromName?: string; toName?: string }
  if (!list || !fromName || !toName?.trim()) {
    res.status(400).json({ error: 'list, fromName, and toName are required' })
    return
  }
  if (fromName === toName.trim()) {
    res.json({ ok: true })
    return
  }
  try {
    await query(
      `UPDATE todos SET category = $1
       WHERE user_id = $2 AND list_name = $3 AND category = $4`,
      [toName.trim(), userId, list, fromName]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/categories — remove every todo in a category within a list
router.delete('/', async (req, res) => {
  const userId = req.userId!
  const { list, name } = req.body as { list?: string; name?: string }
  if (!list || !name) {
    res.status(400).json({ error: 'list and name are required' })
    return
  }
  try {
    await query(
      `DELETE FROM todos
       WHERE user_id = $1 AND list_name = $2 AND category = $3`,
      [userId, list, name]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/categories — rename a category within a list
router.patch('/', async (req, res) => {
  const userId = req.userId!
  const { list, oldName, newName } = req.body as { list?: string; oldName?: string; newName?: string }
  if (!list || !oldName || !newName?.trim()) {
    res.status(400).json({ error: 'list, oldName, and newName are required' })
    return
  }
  try {
    await query(
      `UPDATE todos SET category = $1
       WHERE user_id = $2 AND list_name = $3 AND category = $4`,
      [newName.trim(), userId, list, oldName]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
