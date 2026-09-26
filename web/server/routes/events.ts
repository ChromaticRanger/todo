import express from 'express'
import { rateLimit as rateLimiter, ipKeyGenerator } from 'express-rate-limit'
import { subscribe } from '../lib/realtime.js'

const router = express.Router()

/**
 * A browser reconnects an EventSource automatically and forever, so a bad
 * deploy or a proxy hiccup turns into a reconnect loop. Under the app-wide
 * limiter (60/min for free users, keyed on user id) that loop would spend the
 * user's entire budget in a minute and 429 the rest of the app — which is why
 * this route mounts ahead of it and brings its own, sized for connections
 * rather than API calls.
 */
const connectionLimit = rateLimiter({
  windowMs: 60_000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? ipKeyGenerator(req.ip ?? ''),
  message: { error: 'rate_limited' },
})

// GET /api/events — the shared-lists realtime stream.
//
// Deliberately carries ids only, never item bodies: the client already knows
// how to fetch list contents, and an id-only stream can't leak content to a
// recipient whose access changed between publish and delivery.
router.get('/', connectionLimit, (req, res) => {
  const userId = req.userId!

  // Demo visitors get an ephemeral user each and can't be in a share, so a
  // stream would only ever hold a socket open for nothing.
  if (userId.startsWith('demo-')) {
    res.status(204).end()
    return
  }

  subscribe(userId, res)
})

export default router
