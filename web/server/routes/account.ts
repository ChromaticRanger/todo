import { Router } from 'express'
import { pool, query } from '../db.js'
import { stripe } from '../auth.js'
import { isAdminEmail } from '../middleware/requireAdmin.js'

const router = Router()

// GET /api/account — profile info for the Account page.
router.get('/', async (req, res) => {
  const userId = req.userId!
  try {
    const { rows } = await query<{
      id: string
      email: string
      name: string | null
      tier: string | null
      createdAt: Date
    }>(
      `SELECT id, email, name, tier, "createdAt"
         FROM "user"
        WHERE id = $1`,
      [userId]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ ...rows[0], isAdmin: isAdminEmail(rows[0].email) })
  } catch (err) {
    console.error('[account] GET failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/account — permanently delete the signed-in user.
//
// Order of operations:
//   1. Cancel any active Stripe subscriptions via the Stripe API.
//      Done outside the DB transaction so a Stripe failure aborts the whole
//      operation before any local rows are removed.
//   2. Delete the user row. FK cascades clean up: session, account,
//      verification (Better Auth), todos, app_settings, shared_lists
//      (added in migration 022), and via shared_lists → shared_items.
router.delete('/', async (req, res) => {
  const userId = req.userId!
  try {
    if (stripe) {
      // Find subs the Better Auth Stripe plugin tracks for this user.
      // referenceId = userId per the plugin's onSubscriptionComplete handler.
      const { rows: subs } = await query<{ stripeSubscriptionId: string | null; status: string }>(
        `SELECT "stripeSubscriptionId", status
           FROM subscription
          WHERE "referenceId" = $1
            AND status IN ('active', 'trialing', 'past_due')`,
        [userId]
      )
      for (const sub of subs) {
        if (!sub.stripeSubscriptionId) continue
        try {
          await stripe.subscriptions.cancel(sub.stripeSubscriptionId)
        } catch (err: unknown) {
          // If Stripe says the sub is already gone, that's fine — proceed.
          const code = (err as { code?: string })?.code
          if (code !== 'resource_missing') throw err
        }
      }
    }

    // Better Auth signs the user out at the network layer too. We don't have
    // a server-side signOut helper handy, but the DELETE below cascades to
    // session rows so any future request from this user's tokens 401s.
    await pool.query('DELETE FROM "user" WHERE id = $1', [userId])
    res.json({ ok: true })
  } catch (err) {
    console.error('[account] DELETE failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
