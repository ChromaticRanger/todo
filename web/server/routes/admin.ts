import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import { query } from '../db.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { connectionStats } from '../lib/realtime.js'
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

// GET /api/admin/realtime — live SSE state for whichever instance answers.
//
// Deliberately not on /api/health: that endpoint is public, and how many people
// are connected right now is commercial information. Repeat the call to sample
// the other instance — `instance` says which one replied, and `listening: false`
// on any of them means cross-instance events are silently not being delivered.
router.get('/realtime', (_req, res) => {
  res.json(connectionStats())
})

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

// ---- Discover moderation ----

const SYSTEM_USER_ID = 'system-stash-squirrel'

interface DiscoverRow {
  id: number
  slug: string
  name: string
  category: string
  owner_user_id: string
  owner_name: string | null
  owner_email: string | null
  is_hidden: boolean
  published_at: Date | string
  itemCount: string
  likeCount: string
  openReports: string
}

// GET /api/admin/discover — published lists, newest first.
//   ?scope=reported  only lists with an unresolved report
//   ?scope=all       include the curated system lists
//   ?q=              match name or slug
router.get('/discover', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  const scope = String(req.query.scope ?? '').trim()
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const offset = Math.max(Number(req.query.offset) || 0, 0)

  const where: string[] = []
  const params: unknown[] = []
  if (q) {
    params.push(`%${q.toLowerCase()}%`)
    where.push(`(LOWER(sl.name) LIKE $${params.length} OR LOWER(sl.slug) LIKE $${params.length})`)
  }
  // The 37 curated lists would bury community submissions, which are the ones
  // that actually need moderating — so they're out unless asked for.
  if (scope !== 'all') {
    params.push(SYSTEM_USER_ID)
    where.push(`sl.owner_user_id <> $${params.length}`)
  }
  if (scope === 'reported') {
    where.push(
      `EXISTS (SELECT 1 FROM shared_list_reports r
                WHERE r.shared_list_id = sl.id AND r.resolved_at IS NULL)`
    )
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  params.push(limit)
  params.push(offset)
  const limitParam = `$${params.length - 1}`
  const offsetParam = `$${params.length}`

  try {
    const listsPromise = query<DiscoverRow>(
      `SELECT
          sl.id, sl.slug, sl.name, sl.category, sl.owner_user_id,
          sl.is_hidden, sl.published_at,
          u.name  AS owner_name,
          u.email AS owner_email,
          (SELECT COUNT(*) FROM shared_items si
            WHERE si.shared_list_id = sl.id)::TEXT AS "itemCount",
          (SELECT COUNT(*) FROM shared_list_likes l
            WHERE l.shared_list_id = sl.id)::TEXT AS "likeCount",
          (SELECT COUNT(*) FROM shared_list_reports r
            WHERE r.shared_list_id = sl.id AND r.resolved_at IS NULL)::TEXT AS "openReports"
         FROM shared_lists sl
         LEFT JOIN "user" u ON u.id = sl.owner_user_id
         ${whereSql}
         ORDER BY sl.published_at DESC
         LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params
    )
    const countPromise = query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM shared_lists sl ${whereSql}`,
      params.slice(0, params.length - 2)
    )
    const [listsRes, countRes] = await Promise.all([listsPromise, countPromise])
    res.json({
      lists: listsRes.rows.map((l) => ({
        ...l,
        owner_is_system: l.owner_user_id === SYSTEM_USER_ID,
        itemCount: Number(l.itemCount),
        likeCount: Number(l.likeCount),
        openReports: Number(l.openReports),
      })),
      total: Number(countRes.rows[0].count),
      limit,
      offset,
    })
  } catch (err) {
    console.error('[admin] discover list failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/admin/discover/reports — the open queue, newest first.
router.get('/discover/reports', async (req, res) => {
  const includeResolved = req.query.resolved === '1'
  try {
    const { rows } = await query(
      `SELECT r.id, r.shared_list_id, r.reason, r.detail, r.created_at,
              r.resolved_at, r.resolved_by,
              sl.slug, sl.name AS list_name, sl.is_hidden,
              u.name AS reporter_name, u.email AS reporter_email
         FROM shared_list_reports r
         JOIN shared_lists sl ON sl.id = r.shared_list_id
         LEFT JOIN "user" u ON u.id = r.reporter_user_id
        ${includeResolved ? '' : 'WHERE r.resolved_at IS NULL'}
        ORDER BY r.created_at DESC
        LIMIT 200`
    )
    res.json({ reports: rows })
  } catch (err) {
    console.error('[admin] discover reports failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/admin/discover/:id — hide or restore a published list.
router.patch('/discover/:id', async (req, res) => {
  const id = Number(req.params.id)
  const isHidden = req.body?.is_hidden
  if (!Number.isInteger(id) || typeof isHidden !== 'boolean') {
    res.status(400).json({ error: 'is_hidden (boolean) is required' })
    return
  }
  try {
    const { rows } = await query<{ id: number; slug: string; is_hidden: boolean }>(
      `UPDATE shared_lists SET is_hidden = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, slug, is_hidden`,
      [isHidden, id]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    console.info(
      `[admin] ${req.adminEmail} ${isHidden ? 'hid' : 'restored'} discover list ${rows[0].slug}`
    )
    res.json({ list: rows[0] })
  } catch (err) {
    console.error('[admin] discover hide toggle failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/admin/discover/:id — unpublish someone else's list. The owner's
// own list is untouched; only the public snapshot goes (items, likes and
// reports cascade).
router.delete('/discover/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'invalid id' })
    return
  }
  try {
    const { rows } = await query<{ owner_user_id: string; slug: string }>(
      `SELECT owner_user_id, slug FROM shared_lists WHERE id = $1`,
      [id]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    // The curated lists come from seed migrations already recorded in
    // schema_migrations, and each seeds with ON CONFLICT (slug) DO NOTHING —
    // delete one and it can never be restored, even by re-running migrations.
    // Hiding is reversible; this isn't.
    if (rows[0].owner_user_id === SYSTEM_USER_ID) {
      res.status(400).json({
        error: 'cannot_delete_curated',
        message: 'Curated lists can only be hidden — deleting one is unrecoverable.',
      })
      return
    }
    await query(`DELETE FROM shared_lists WHERE id = $1`, [id])
    console.info(`[admin] ${req.adminEmail} deleted discover list ${rows[0].slug}`)
    res.json({ ok: true })
  } catch (err) {
    console.error('[admin] discover delete failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/admin/discover/reports/:id — resolve or reopen a report.
router.patch('/discover/reports/:id', async (req, res) => {
  const id = Number(req.params.id)
  const resolved = req.body?.resolved
  if (!Number.isInteger(id) || typeof resolved !== 'boolean') {
    res.status(400).json({ error: 'resolved (boolean) is required' })
    return
  }
  try {
    const { rows } = await query(
      `UPDATE shared_list_reports
          SET resolved_at = ${resolved ? 'NOW()' : 'NULL'},
              resolved_by = ${resolved ? '$2' : 'NULL'}
        WHERE id = $1
        RETURNING id, resolved_at, resolved_by`,
      resolved ? [id, req.adminEmail] : [id]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    console.info(
      `[admin] ${req.adminEmail} ${resolved ? 'resolved' : 'reopened'} discover report #${id}`
    )
    res.json({ report: rows[0] })
  } catch (err) {
    console.error('[admin] discover report resolve failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
