import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

const VALID_THEMES = ['midnight', 'slate', 'forest', 'sunset', 'rose', 'mono'] as const
const VALID_MODES = ['light', 'dark'] as const

type ThemeName = (typeof VALID_THEMES)[number]
type ThemeMode = (typeof VALID_MODES)[number]

interface UiSettings {
  theme: ThemeName
  mode: ThemeMode
}

const DEFAULT_SETTINGS: UiSettings = { theme: 'midnight', mode: 'dark' }

// GET /api/settings
router.get('/', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: UiSettings }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'ui'`,
      [userId]
    )
    res.json(result.rows[0]?.value ?? DEFAULT_SETTINGS)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings
router.put('/', async (req, res) => {
  const userId = req.userId!
  const { theme, mode } = req.body as Partial<UiSettings>

  if (!theme || !(VALID_THEMES as readonly string[]).includes(theme)) {
    return res.status(400).json({ error: 'Invalid theme' })
  }
  if (!mode || !(VALID_MODES as readonly string[]).includes(mode)) {
    return res.status(400).json({ error: 'Invalid mode' })
  }

  const value: UiSettings = { theme, mode }
  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'ui', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify(value)]
    )
    res.json(value)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/settings/onboarding
// Returns { hasSeenWelcome }. The row's *absence* (existing pre-feature users)
// resolves to hasSeenWelcome=true so they don't get a tour they didn't sign up for.
router.get('/onboarding', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: { hasSeenWelcome?: boolean } }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'onboarding'`,
      [userId]
    )
    const row = result.rows[0]?.value
    res.json({ hasSeenWelcome: row ? row.hasSeenWelcome !== false : true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings/onboarding
router.put('/onboarding', async (req, res) => {
  const userId = req.userId!
  const { hasSeenWelcome } = req.body as { hasSeenWelcome?: unknown }
  if (typeof hasSeenWelcome !== 'boolean') {
    return res.status(400).json({ error: 'hasSeenWelcome must be a boolean' })
  }
  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'onboarding', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify({ hasSeenWelcome })]
    )
    res.json({ hasSeenWelcome })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/settings/list-order
router.get('/list-order', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: string[] }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'list_order'`,
      [userId]
    )
    res.json({ order: result.rows[0]?.value ?? [] })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings/list-order
router.put('/list-order', async (req, res) => {
  const userId = req.userId!
  const { order } = req.body as { order?: unknown }

  if (!Array.isArray(order) || !order.every((v) => typeof v === 'string')) {
    return res.status(400).json({ error: 'order must be a string array' })
  }

  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'list_order', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify(order)]
    )
    res.json({ order })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/settings/active-list
router.get('/active-list', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: string }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'active_list'`,
      [userId]
    )
    res.json({ activeList: result.rows[0]?.value ?? null })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings/active-list
router.put('/active-list', async (req, res) => {
  const userId = req.userId!
  const { activeList } = req.body as { activeList?: unknown }

  if (typeof activeList !== 'string') {
    return res.status(400).json({ error: 'activeList must be a string' })
  }

  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'active_list', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify(activeList)]
    )
    res.json({ activeList })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/settings/category-order
router.get('/category-order', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: Record<string, string[]> }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'category_order'`,
      [userId]
    )
    res.json({ order: result.rows[0]?.value ?? {} })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings/category-order
router.put('/category-order', async (req, res) => {
  const userId = req.userId!
  const { order } = req.body as { order?: unknown }

  if (
    !order ||
    typeof order !== 'object' ||
    Array.isArray(order) ||
    !Object.values(order).every(
      (v) => Array.isArray(v) && v.every((s) => typeof s === 'string')
    )
  ) {
    return res.status(400).json({ error: 'order must be Record<string, string[]>' })
  }

  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'category_order', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify(order)]
    )
    res.json({ order })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/settings/list-prefs
const VALID_LAYOUTS = ['grid', 'kanban'] as const
const VALID_COLUMNS = [2, 3, 4, 5] as const
type LayoutMode = (typeof VALID_LAYOUTS)[number]
type GridColumns = (typeof VALID_COLUMNS)[number]
interface ListPref { layout: LayoutMode; columns: GridColumns }

router.get('/list-prefs', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: Record<string, ListPref> }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'list_prefs'`,
      [userId]
    )
    res.json({ prefs: result.rows[0]?.value ?? {} })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings/list-prefs
router.put('/list-prefs', async (req, res) => {
  const userId = req.userId!
  const { prefs } = req.body as { prefs?: unknown }
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return res.status(400).json({ error: 'prefs must be an object' })
  }
  const sanitized: Record<string, ListPref> = {}
  for (const [list, val] of Object.entries(prefs as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue
    const v = val as Partial<ListPref>
    if (!(VALID_LAYOUTS as readonly string[]).includes(v.layout as string)) continue
    if (!(VALID_COLUMNS as readonly number[]).includes(v.columns as number)) continue
    sanitized[list] = { layout: v.layout as LayoutMode, columns: v.columns as GridColumns }
  }
  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'list_prefs', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify(sanitized)]
    )
    res.json({ prefs: sanitized })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/settings/category-prefs
const VALID_ITEM_LAYOUTS = ['list', 'grid'] as const
type ItemLayout = (typeof VALID_ITEM_LAYOUTS)[number]
interface CategoryPref { itemLayout: ItemLayout }
type CategoryPrefsMap = Record<string, Record<string, CategoryPref>>

router.get('/category-prefs', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: CategoryPrefsMap }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'category_prefs'`,
      [userId]
    )
    res.json({ prefs: result.rows[0]?.value ?? {} })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings/category-prefs
router.put('/category-prefs', async (req, res) => {
  const userId = req.userId!
  const { prefs } = req.body as { prefs?: unknown }
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) {
    return res.status(400).json({ error: 'prefs must be an object' })
  }
  const sanitized: CategoryPrefsMap = {}
  for (const [list, cats] of Object.entries(prefs as Record<string, unknown>)) {
    if (!cats || typeof cats !== 'object' || Array.isArray(cats)) continue
    const catMap: Record<string, CategoryPref> = {}
    for (const [category, val] of Object.entries(cats as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue
      const v = val as Partial<CategoryPref>
      if (!(VALID_ITEM_LAYOUTS as readonly string[]).includes(v.itemLayout as string)) continue
      // 'list' is the default — no need to persist it.
      if (v.itemLayout === 'list') continue
      catMap[category] = { itemLayout: v.itemLayout as ItemLayout }
    }
    if (Object.keys(catMap).length > 0) sanitized[list] = catMap
  }
  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'category_prefs', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify(sanitized)]
    )
    res.json({ prefs: sanitized })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/settings/empty-lists
// Lists exist server-side as DISTINCT list_name FROM todos, so a list with no
// todos has no first-class identity. We persist user-created empty lists here
// and union them in client-side on fetchLists so the UI doesn't lose them
// across refreshes. Cleared once the list gets a real item.
router.get('/empty-lists', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: string[] }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'empty_lists'`,
      [userId]
    )
    res.json({ empty: result.rows[0]?.value ?? [] })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings/empty-lists
router.put('/empty-lists', async (req, res) => {
  const userId = req.userId!
  const { empty } = req.body as { empty?: unknown }

  if (!Array.isArray(empty) || !empty.every((v) => typeof v === 'string')) {
    return res.status(400).json({ error: 'empty must be a string array' })
  }

  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'empty_lists', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify(empty)]
    )
    res.json({ empty })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/settings/empty-categories
router.get('/empty-categories', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ value: Record<string, string[]> }>(
      `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'empty_categories'`,
      [userId]
    )
    res.json({ empty: result.rows[0]?.value ?? {} })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings/empty-categories
router.put('/empty-categories', async (req, res) => {
  const userId = req.userId!
  const { empty } = req.body as { empty?: unknown }

  if (
    !empty ||
    typeof empty !== 'object' ||
    Array.isArray(empty) ||
    !Object.values(empty).every(
      (v) => Array.isArray(v) && v.every((s) => typeof s === 'string')
    )
  ) {
    return res.status(400).json({ error: 'empty must be Record<string, string[]>' })
  }

  try {
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'empty_categories', $2, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [userId, JSON.stringify(empty)]
    )
    res.json({ empty })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
