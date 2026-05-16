import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// GET /api/lists — all distinct list names for this user, unioned with any
// user-created empty lists (which app_settings.empty_lists tracks so they
// survive a refresh even though no todo references them yet).
router.get('/', async (req, res) => {
  const userId = req.userId!
  try {
    const [listsResult, emptyResult] = await Promise.all([
      query<{ list_name: string }>(
        `SELECT DISTINCT list_name FROM todos
         WHERE user_id = $1 AND type <> 'event'`,
        [userId]
      ),
      query<{ value: string[] }>(
        `SELECT value FROM app_settings
         WHERE user_id = $1 AND key = 'empty_lists'`,
        [userId]
      ),
    ])
    const real = listsResult.rows.map((r) => r.list_name)
    const realSet = new Set(real)
    const stillEmpty = (emptyResult.rows[0]?.value ?? []).filter(
      (n) => !realSet.has(n)
    )
    const all = [...real, ...stillEmpty].sort((a, b) => a.localeCompare(b))
    res.json({ lists: all })
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
    const trimmed = newName.trim()
    await query(
      'UPDATE todos SET list_name = $1 WHERE list_name = $2 AND user_id = $3',
      [trimmed, req.params.name, userId]
    )
    await query(
      `UPDATE shared_lists SET original_list_name = $1
        WHERE owner_user_id = $2 AND original_list_name = $3`,
      [trimmed, userId, req.params.name]
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
