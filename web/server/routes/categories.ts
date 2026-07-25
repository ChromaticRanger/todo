import { Router } from 'express'
import { query } from '../db.js'
import { LIMITS, countUserLists, userHasList } from '../lib/limits.js'

const router = Router()

/** First free name in the "Work", "Work(1)", "Work(2)", … sequence. Terminates:
 *  `taken` is finite, so at most taken.size + 1 candidates are tried. */
function nextFreeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 1
  while (taken.has(`${base}(${i})`)) i++
  return `${base}(${i})`
}

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

// POST /api/categories/move-to-list — move a whole category, and every item in
// it, to another list. A category is just a string on each todo, so this is a
// bulk re-stamp of list_name + category. If the target list already has a
// category by that name the incoming one arrives as "Name(1)" (then (2), …)
// rather than silently merging into it; the response carries the final name so
// the client can follow it in its own settings.
router.post('/move-to-list', async (req, res) => {
  const userId = req.userId!
  const { fromList, toList, name } = req.body as {
    fromList?: string
    toList?: string
    name?: string
  }
  if (!fromList || !toList?.trim() || !name) {
    res.status(400).json({ error: 'fromList, toList, and name are required' })
    return
  }
  const target = toList.trim()
  if (target === fromList) {
    res.status(400).json({ error: 'same_list' })
    return
  }
  try {
    // Moving into a list that doesn't exist yet creates one, so it's subject to
    // the same free-plan cap as the single-item move route.
    if (req.plan === 'free' && !(await userHasList(userId, target))) {
      if ((await countUserLists(userId)) >= LIMITS.maxLists) {
        res.status(403).json({ error: 'free_tier_list_limit', limit: LIMITS.maxLists })
        return
      }
    }

    // Names already spoken for in the target list: every category in use there
    // (completed items included — their category shouldn't be reused out from
    // under them) plus any user-created empty ones.
    const [usedResult, emptyResult] = await Promise.all([
      query<{ category: string }>(
        `SELECT DISTINCT category FROM todos
         WHERE user_id = $1 AND list_name = $2 AND type <> 'event'`,
        [userId, target]
      ),
      query<{ value: Record<string, string[]> }>(
        `SELECT value FROM app_settings
         WHERE user_id = $1 AND key = 'empty_categories'`,
        [userId]
      ),
    ])
    const taken = new Set(usedResult.rows.map((r) => r.category))
    for (const c of emptyResult.rows[0]?.value?.[target] ?? []) taken.add(c)

    const finalName = nextFreeName(name, taken)
    // Events are excluded: they live outside any list, and GET / already keeps
    // them out of the category listing, so sweeping one along would be a no-op
    // the user never asked for.
    const result = await query<{ status: number; snoozed_until: string | null }>(
      `UPDATE todos SET list_name = $1, category = $2
       WHERE user_id = $3 AND list_name = $4 AND category = $5 AND type <> 'event'
       RETURNING status, snoozed_until`,
      [target, finalName, userId, fromList, name]
    )

    // The category view renders pending, un-snoozed items only, so a category
    // of nothing but completed or snoozed items materializes no card in the
    // target list. Report how many rows will actually show: the client needs
    // to know whether to register the category as an explicitly-empty one,
    // otherwise the move looks like the category vanished.
    const now = Math.floor(Date.now() / 1000)
    const visible = result.rows.filter(
      (r) => Number(r.status) === 0 &&
        (r.snoozed_until == null || Number(r.snoozed_until) <= now)
    ).length

    res.json({ ok: true, name: finalName, moved: result.rowCount ?? 0, visible })
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
