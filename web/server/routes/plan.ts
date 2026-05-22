import { Router } from 'express'
import { query } from '../db.js'
import { LIMITS, countUserLists, countUserItems } from '../lib/limits.js'
import { sendWelcomeEmailFor } from '../lib/email.js'

const router = Router()

// POST /api/plan/select-free — only valid when tier is currently null
router.post('/select-free', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<{ email: string; name: string | null }>(
      'UPDATE "user" SET tier = $1 WHERE id = $2 AND tier IS NULL RETURNING email, name',
      ['free', userId]
    )
    if (result.rowCount === 0) {
      res.status(409).json({ error: 'plan_already_set' })
      return
    }
    // tier IS NULL guard means this UPDATE only ever succeeds once per user,
    // so the welcome email fires exactly once on initial Free selection.
    try {
      await sendWelcomeEmailFor(result.rows[0], 'free')
    } catch (err) {
      console.error('[plan/select-free] welcome email failed:', err)
    }
    res.json({ ok: true, tier: 'free' })
  } catch (err) {
    console.error('[plan/select-free] failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/plan/status — counts + cap-overage flags for UI
router.get('/status', async (req, res) => {
  const userId = req.userId!
  try {
    const { rows } = await query<{ tier: string | null }>(
      'SELECT tier FROM "user" WHERE id = $1',
      [userId]
    )
    const tier = rows[0]?.tier ?? null
    const [listCount, itemCount] = await Promise.all([
      countUserLists(userId),
      countUserItems(userId),
    ])
    res.json({
      tier,
      listCount,
      itemCount,
      limits: { maxLists: LIMITS.maxLists, maxItems: LIMITS.maxItems },
      overListCap: tier === 'free' && listCount > LIMITS.maxLists,
      overItemCap: tier === 'free' && itemCount > LIMITS.maxItems,
    })
  } catch (err) {
    console.error('[plan/status] failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
