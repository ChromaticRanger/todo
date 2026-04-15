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
router.get('/', async (_req, res) => {
  try {
    const result = await query<{ value: UiSettings }>(
      `SELECT value FROM app_settings WHERE key = 'ui'`
    )
    res.json(result.rows[0]?.value ?? DEFAULT_SETTINGS)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/settings
router.put('/', async (req, res) => {
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
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('ui', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(value)]
    )
    res.json(value)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
