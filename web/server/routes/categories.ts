import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// GET /api/categories?list=X — distinct categories for incomplete todos in
// that list, unioned with any user-created empty categories for the list
// (kept in app_settings.empty_categories so they survive a refresh).
router.get('/', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    const [catsResult, emptyResult] = await Promise.all([
      query<{ category: string }>(
        `SELECT DISTINCT category FROM todos
         WHERE user_id = $1 AND list_name = $2 AND status = 0
           AND type <> 'event'`,
        [userId, list]
      ),
      query<{ value: Record<string, string[]> }>(
        `SELECT value FROM app_settings
         WHERE user_id = $1 AND key = 'empty_categories'`,
        [userId]
      ),
    ])
    const real = catsResult.rows.map((r) => r.category)
    const realSet = new Set(real)
    const emptyForList = emptyResult.rows[0]?.value?.[list] ?? []
    const stillEmpty = emptyForList.filter((c) => !realSet.has(c))
    const all = [...real, ...stillEmpty].sort((a, b) => a.localeCompare(b))
    res.json({ categories: all })
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
