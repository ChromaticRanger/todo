import { Router } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth.js'

const router = Router()

// POST /api/extension/token
// Called from the /connect-extension page after the user has signed in
// (cookie session). Returns the session token so the browser extension can
// use it as `Authorization: Bearer <token>` for subsequent API calls.
//
// Note: this is the same session token backing the web-app cookie, so
// revoking it via /revoke (or signing out in the web app) disconnects the
// extension. Acceptable for v1; revisit if we want independent sessions.
router.post('/token', async (req, res) => {
  try {
    const headers = fromNodeHeaders(req.headers)
    const session = await auth.api.getSession({ headers })
    if (!session?.session?.token) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    res.json({
      token: session.session.token,
      expiresAt: session.session.expiresAt,
    })
  } catch (err) {
    console.error('[extension/token] failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/extension/revoke
// Signs out the current session, whether the caller authenticated via
// cookie or via Authorization: Bearer.
router.post('/revoke', async (req, res) => {
  try {
    const headers = fromNodeHeaders(req.headers)
    await auth.api.signOut({ headers })
    res.json({ ok: true })
  } catch (err) {
    console.error('[extension/revoke] failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
