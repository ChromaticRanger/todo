import { Router } from 'express'
import { timingSafeEqual } from 'crypto'
import { runDailyDigests } from '../lib/digest.js'

const router = Router()

// Constant-time comparison so the secret can't be guessed by timing.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// POST /api/cron/daily-digest
// Machine-to-machine: triggered by the scheduled GitHub Actions workflow (or a
// manual run). Guarded by a shared secret in the X-Cron-Secret header rather
// than a user session — mounted before authMiddleware for that reason.
router.post('/daily-digest', async (req, res) => {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return res.status(503).json({ error: 'CRON_SECRET is not configured' })
  }
  const provided = req.get('X-Cron-Secret') ?? ''
  if (!provided || !secretMatches(provided, expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  // force=1 bypasses the per-user local-hour gate (manual testing); the per-day
  // dedupe still applies.
  const force = req.query.force === '1' || req.query.force === 'true'
  try {
    const summary = await runDailyDigests({ force })
    console.log('[cron] daily digest run:', summary)
    res.json({ ok: true, ...summary })
  } catch (err) {
    console.error('[cron] daily digest failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
