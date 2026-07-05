import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { query } from '../db.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { parseFrontmatter, FrontmatterError } from '../lib/frontmatter.js'
import { upsertBlogPost } from '../lib/blogPosts.js'

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

// ---------------------------------------------------------------------------
// Blog management — upload/list/publish/delete posts.
// ---------------------------------------------------------------------------

const MAX_POST_BYTES = 512 * 1024
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_POST_BYTES, files: 1 },
})

// Mirror import.ts: translate multer errors into clean JSON responses.
function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next()
    const e = err as { code?: string; message?: string }
    if (e.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'file_too_large', limit_bytes: MAX_POST_BYTES })
    }
    return res.status(400).json({ error: 'upload_failed', message: e.message ?? String(err) })
  })
}

interface BlogRow {
  id: number
  slug: string
  title: string
  summary: string
  is_published: boolean
  published_at: Date | null
  updated_at: Date
}

// GET /api/admin/blog — every post incl. drafts, newest first.
router.get('/blog', async (_req, res) => {
  try {
    const { rows } = await query<BlogRow>(
      `SELECT id, slug, title, summary, is_published, published_at, updated_at
         FROM blog_posts
        ORDER BY COALESCE(published_at, created_at) DESC`
    )
    res.json({ posts: rows })
  } catch (err) {
    console.error('[admin] blog list failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/admin/blog — upload a .md file; upsert by slug so re-uploading edits.
router.post('/blog', uploadSingle, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'file_required' })
    return
  }
  let parsed
  try {
    parsed = parseFrontmatter(req.file.buffer.toString('utf8'))
  } catch (err) {
    if (err instanceof FrontmatterError) {
      res.status(400).json({ error: 'invalid_frontmatter', message: err.message })
      return
    }
    console.error('[admin] blog parse failed:', err)
    res.status(500).json({ error: 'parse_failed' })
    return
  }
  if (!parsed.body) {
    res.status(400).json({ error: 'empty_body', message: 'The post has no body content.' })
    return
  }
  try {
    const post = await upsertBlogPost(parsed, req.adminEmail ?? '')
    console.info(`[admin] ${req.adminEmail} uploaded blog post "${parsed.slug}" (published=${parsed.published})`)
    res.json({ post })
  } catch (err) {
    console.error('[admin] blog upsert failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/admin/blog/:id — publish / unpublish without a re-upload.
router.patch('/blog/:id', async (req, res) => {
  const id = Number(req.params.id)
  const isPublished = req.body?.is_published
  if (!Number.isInteger(id) || typeof isPublished !== 'boolean') {
    res.status(400).json({ error: 'is_published (boolean) is required' })
    return
  }
  try {
    const { rows } = await query<BlogRow>(
      `UPDATE blog_posts SET
         is_published = $1,
         published_at = CASE
           WHEN $1 AND published_at IS NULL THEN NOW()
           WHEN NOT $1 THEN NULL
           ELSE published_at
         END,
         updated_at = NOW()
       WHERE id = $2
       RETURNING id, slug, title, summary, is_published, published_at, updated_at`,
      [isPublished, id]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    res.json({ post: rows[0] })
  } catch (err) {
    console.error('[admin] blog publish toggle failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/admin/blog/:id — delete a post (reactions cascade).
router.delete('/blog/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }
  try {
    const { rowCount } = await query(`DELETE FROM blog_posts WHERE id = $1`, [id])
    if (rowCount === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    console.info(`[admin] ${req.adminEmail} deleted blog post #${id}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin] blog delete failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
