import { Router } from 'express'
import { query } from '../db.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = Router()

// Every endpoint in here is admin-only.
router.use(requireAdmin)

interface UserRow {
  id: string
  email: string
  name: string | null
  tier: string | null
  tierSource: string | null
  createdAt: Date
  emailVerified: boolean
  todoCount: string
  hasSubscription: boolean
}

// GET /api/admin/stats — top-of-page overview cards
router.get('/stats', async (_req, res) => {
  try {
    const { rows } = await query<{
      total: string
      free: string
      pro: string
      none: string
      new7: string
      new30: string
      comp: string
    }>(
      `SELECT
         COUNT(*)::TEXT                                              AS total,
         COUNT(*) FILTER (WHERE tier = 'free')::TEXT                 AS free,
         COUNT(*) FILTER (WHERE tier = 'pro')::TEXT                  AS pro,
         COUNT(*) FILTER (WHERE tier IS NULL)::TEXT                  AS none,
         COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '7 days')::TEXT  AS new7,
         COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL '30 days')::TEXT AS new30,
         COUNT(*) FILTER (WHERE tier = 'pro' AND "tierSource" = 'comp')::TEXT   AS comp
       FROM "user"`
    )
    const r = rows[0]
    res.json({
      total: Number(r.total),
      free: Number(r.free),
      pro: Number(r.pro),
      none: Number(r.none),
      newLast7Days: Number(r.new7),
      newLast30Days: Number(r.new30),
      comp: Number(r.comp),
    })
  } catch (err) {
    console.error('[admin] stats failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/admin/users — paginated list with search/filter
router.get('/users', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  const tier = String(req.query.tier ?? '').trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const where: string[] = []
  const params: unknown[] = []
  if (q) {
    params.push(`%${q.toLowerCase()}%`)
    where.push(`(LOWER(u.email) LIKE $${params.length} OR LOWER(COALESCE(u.name, '')) LIKE $${params.length})`)
  }
  if (tier === 'free' || tier === 'pro') {
    params.push(tier)
    where.push(`u.tier = $${params.length}`)
  } else if (tier === 'none') {
    where.push(`u.tier IS NULL`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  params.push(limit)
  params.push(offset)
  const limitParam = `$${params.length - 1}`
  const offsetParam = `$${params.length}`

  try {
    const usersPromise = query<UserRow>(
      `SELECT
          u.id,
          u.email,
          u.name,
          u.tier,
          u."tierSource"                                              AS "tierSource",
          u."createdAt"                                               AS "createdAt",
          u."emailVerified"                                           AS "emailVerified",
          (SELECT COUNT(*) FROM todos t WHERE t.user_id = u.id)::TEXT AS "todoCount",
          EXISTS(
            SELECT 1 FROM subscription s
             WHERE s."referenceId" = u.id
               AND s.status IN ('active', 'trialing', 'past_due')
          )                                                           AS "hasSubscription"
         FROM "user" u
         ${whereSql}
         ORDER BY u."createdAt" DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    )
    const countPromise = query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM "user" u ${whereSql}`,
      params.slice(0, params.length - 2)
    )
    const [usersRes, countRes] = await Promise.all([usersPromise, countPromise])
    res.json({
      users: usersRes.rows.map((u) => ({
        ...u,
        todoCount: Number(u.todoCount),
      })),
      total: Number(countRes.rows[0].count),
      limit,
      offset,
    })
  } catch (err) {
    console.error('[admin] users list failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/admin/users/:id — full per-user detail
router.get('/users/:id', async (req, res) => {
  const userId = req.params.id
  try {
    const userPromise = query<{
      id: string
      email: string
      name: string | null
      tier: string | null
      tierSource: string | null
      createdAt: Date
      updatedAt: Date
      emailVerified: boolean
      image: string | null
    }>(
      `SELECT id, email, name, tier, "tierSource",
              "createdAt", "updatedAt", "emailVerified", image
         FROM "user" WHERE id = $1`,
      [userId]
    )
    const subscriptionPromise = query<{
      stripeSubscriptionId: string | null
      stripeCustomerId: string | null
      status: string | null
      plan: string | null
      periodEnd: Date | null
    }>(
      `SELECT "stripeSubscriptionId", "stripeCustomerId", status, plan, "periodEnd"
         FROM subscription
        WHERE "referenceId" = $1
        ORDER BY "periodEnd" DESC NULLS LAST
        LIMIT 1`,
      [userId]
    )
    const countsPromise = query<{
      todos: string
      bookmarks: string
      notes: string
      lists: string
      categories: string
    }>(
      `SELECT
          COUNT(*) FILTER (WHERE type = 'todo')::TEXT     AS todos,
          COUNT(*) FILTER (WHERE type = 'bookmark')::TEXT AS bookmarks,
          COUNT(*) FILTER (WHERE type = 'note')::TEXT     AS notes,
          COUNT(DISTINCT list_name)::TEXT                 AS lists,
          COUNT(DISTINCT category)::TEXT                  AS categories
         FROM todos
        WHERE user_id = $1`,
      [userId]
    )
    const lastSessionPromise = query<{ updatedAt: Date | null }>(
      `SELECT MAX("updatedAt") AS "updatedAt" FROM session WHERE "userId" = $1`,
      [userId]
    )

    const [userRes, subRes, countsRes, lastRes] = await Promise.all([
      userPromise,
      subscriptionPromise,
      countsPromise,
      lastSessionPromise,
    ])

    if (userRes.rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    const counts = countsRes.rows[0]
    res.json({
      user: userRes.rows[0],
      subscription: subRes.rows[0] ?? null,
      counts: {
        todos: Number(counts.todos),
        bookmarks: Number(counts.bookmarks),
        notes: Number(counts.notes),
        lists: Number(counts.lists),
        categories: Number(counts.categories),
      },
      lastSessionAt: lastRes.rows[0]?.updatedAt ?? null,
    })
  } catch (err) {
    console.error('[admin] user detail failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/admin/users/:id/tier — comp / un-comp a PRO account
router.post('/users/:id/tier', async (req, res) => {
  const userId = req.params.id
  const tier = req.body?.tier
  if (tier !== 'free' && tier !== 'pro') {
    res.status(400).json({ error: 'tier must be "free" or "pro"' })
    return
  }
  try {
    // Refuse if the user has an active Stripe subscription — a comp toggle
    // would be at war with the next webhook. Surface the conflict so the admin
    // can cancel the sub in Stripe first if that's really what they want.
    const { rows: subs } = await query<{ status: string }>(
      `SELECT status FROM subscription
        WHERE "referenceId" = $1
          AND status IN ('active', 'trialing', 'past_due')
        LIMIT 1`,
      [userId]
    )
    if (subs.length > 0) {
      res.status(409).json({
        error: 'has_active_subscription',
        message:
          'This user has an active Stripe subscription. Cancel it in Stripe before changing their tier here.',
      })
      return
    }

    const { rows } = await query<{ id: string; email: string }>(
      `UPDATE "user"
          SET tier = $1, "tierSource" = $2
        WHERE id = $3
        RETURNING id, email`,
      [tier, 'comp', userId]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    console.info(
      `[admin] ${req.adminEmail} set tier=${tier} (comp) for ${rows[0].email} (${rows[0].id})`
    )
    res.json({ ok: true, tier, tierSource: 'comp' })
  } catch (err) {
    console.error('[admin] tier toggle failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
