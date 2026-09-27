import { Router } from 'express'
import { pool, query } from '../db.js'
import { isListCategory } from '../sharedCategories.js'

const router = Router()

const STASH_SQUIRREL_USER_ID = 'system-stash-squirrel'

interface SharedListRow {
  id: number
  slug: string
  name: string
  description: string
  icon: string
  category: string
  owner_user_id: string
  original_list_name: string
  sort_order: number
  published_at: Date | string
  updated_at: Date | string
  owner_name: string | null
  item_count: string | number
  is_hidden: boolean
  like_count: string | number
  liked_by_me: boolean
}

/** Reasons a reader can pick in the report dialog. Mirrored in the client. */
const REPORT_REASONS = ['spam', 'offensive', 'broken', 'other'] as const
type ReportReason = (typeof REPORT_REASONS)[number]

function isReportReason(v: unknown): v is ReportReason {
  return typeof v === 'string' && (REPORT_REASONS as readonly string[]).includes(v)
}

/** Free-text on a report is optional and advisory — cap it rather than reject. */
const MAX_REPORT_DETAIL = 1000

/**
 * Users who may browse Discover but must not act on it.
 *
 * Demo visitors have tier='pro', so ensurePro lets them through. Their likes
 * would be swept with them after 24h (lib/demoCleanup.ts) while skewing the
 * ranking in the meantime, and their reports would be noise. Same shape as
 * isReservedUser() in routes/collab.ts.
 */
function isReservedUser(id: string): boolean {
  return id.startsWith('demo-') || id === STASH_SQUIRREL_USER_ID
}

interface SharedItemRow {
  id: number
  category: string
  type: string
  title: string
  description: string
  url: string | null
  priority: number
  repeat_days: number
  repeat_months: number
  sort_order: number
}

function ensurePro(req: { plan?: string }, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  if (req.plan !== 'pro') {
    res.status(403).json({ error: 'pro_required' })
    return false
  }
  return true
}

function addMonths(epochSecs: number, months: number): number {
  const d = new Date(epochSecs * 1000)
  d.setMonth(d.getMonth() + months)
  return Math.floor(d.getTime() / 1000)
}

function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'list'
}

function shapeListMeta(row: SharedListRow) {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    category: row.category,
    owner_user_id: row.owner_user_id,
    owner_name: row.owner_name ?? 'Unknown',
    owner_is_system: row.owner_user_id === STASH_SQUIRREL_USER_ID,
    item_count: Number(row.item_count),
    is_hidden: !!row.is_hidden,
    like_count: Number(row.like_count ?? 0),
    liked_by_me: !!row.liked_by_me,
    published_at: typeof row.published_at === 'string' ? row.published_at : row.published_at.toISOString(),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString(),
  }
}

// GET /api/shared/lists — catalogue (optional ?category=X&publisher=Y filters)
router.get('/lists', async (req, res) => {
  if (!ensurePro(req, res)) return
  try {
    const params: unknown[] = []

    // $1 is always the caller: it drives the liked_by_me probe and the
    // owner-sees-own-hidden-list rule below.
    params.push(req.userId)
    const meParam = `$${params.length}`

    // is_hidden is the moderator's switch; is_published is the publisher's.
    //
    // A hidden list stays visible to the person who published it, badged, so
    // they aren't left hunting a catalogue for a list they were told was
    // published. Hiding it from them too would just generate support tickets
    // saying publishing is broken.
    const where: string[] = [
      'sl.is_published = TRUE',
      `(sl.is_hidden = FALSE OR sl.owner_user_id = ${meParam})`,
    ]

    const rawCategory = (req.query.category as string | undefined)?.trim()
    if (rawCategory && isListCategory(rawCategory)) {
      params.push(rawCategory)
      where.push(`sl.category = $${params.length}`)
    }

    const rawPublisher = (req.query.publisher as string | undefined)?.trim()
    if (rawPublisher) {
      params.push(`%${rawPublisher}%`)
      where.push(`u.name ILIKE $${params.length}`)
    }

    // ORDER BY must use the numeric count, never a ::TEXT alias — COUNT(*) is
    // bigint and a text sort would put "9" above "10" while looking plausible.
    // Under `likes`, sort_order drops out entirely so the curated lists
    // (sort_order 1000) compete on merit rather than pinning to the top.
    const orderBy =
      req.query.sort === 'likes'
        ? 'lc.n DESC, sl.published_at DESC'
        : 'sl.sort_order DESC, sl.published_at DESC'

    const result = await query<SharedListRow>(
      `SELECT sl.id, sl.slug, sl.name, sl.description, sl.icon, sl.category,
              sl.owner_user_id, sl.original_list_name, sl.sort_order,
              sl.is_hidden, sl.published_at, sl.updated_at,
              u.name AS owner_name,
              (SELECT COUNT(*) FROM shared_items si WHERE si.shared_list_id = sl.id) AS item_count,
              lc.n AS like_count,
              EXISTS (
                SELECT 1 FROM shared_list_likes l
                 WHERE l.shared_list_id = sl.id AND l.user_id = ${meParam}
              ) AS liked_by_me
         FROM shared_lists sl
         LEFT JOIN "user" u ON u.id = sl.owner_user_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS n FROM shared_list_likes l WHERE l.shared_list_id = sl.id
         ) lc ON TRUE
         WHERE ${where.join(' AND ')}
         ORDER BY ${orderBy}`,
      params
    )
    res.json({ lists: result.rows.map(shapeListMeta) })
  } catch (err) {
    console.error('[shared/lists] failed:', err)
    res.status(500).json({ error: 'shared_list_lookup_failed' })
  }
})

// GET /api/shared/lists/:slug — list + items grouped by category
router.get('/lists/:slug', async (req, res) => {
  if (!ensurePro(req, res)) return
  try {
    const meta = await query<SharedListRow>(
      `SELECT sl.id, sl.slug, sl.name, sl.description, sl.icon, sl.category,
              sl.owner_user_id, sl.original_list_name, sl.sort_order,
              sl.is_hidden, sl.published_at, sl.updated_at,
              u.name AS owner_name,
              (SELECT COUNT(*) FROM shared_items si WHERE si.shared_list_id = sl.id) AS item_count,
              lc.n AS like_count,
              EXISTS (
                SELECT 1 FROM shared_list_likes l
                 WHERE l.shared_list_id = sl.id AND l.user_id = $2
              ) AS liked_by_me
         FROM shared_lists sl
         LEFT JOIN "user" u ON u.id = sl.owner_user_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS n FROM shared_list_likes l WHERE l.shared_list_id = sl.id
         ) lc ON TRUE
         WHERE sl.slug = $1 AND sl.is_published = TRUE
           AND (sl.is_hidden = FALSE OR sl.owner_user_id = $2)`,
      [req.params.slug, req.userId]
    )
    if (meta.rowCount === 0) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    const items = await query<SharedItemRow>(
      `SELECT id, category, type, title, description, url, priority, repeat_days, repeat_months, sort_order
         FROM shared_items
         WHERE shared_list_id = $1
         ORDER BY category, sort_order, id`,
      [meta.rows[0].id]
    )

    const categoryMap = new Map<string, SharedItemRow[]>()
    for (const item of items.rows) {
      const cat = item.category || 'General'
      if (!categoryMap.has(cat)) categoryMap.set(cat, [])
      categoryMap.get(cat)!.push(item)
    }
    const categories = [...categoryMap.entries()].map(([name, rows]) => ({
      name,
      items: rows.map((r) => ({
        id: Number(r.id),
        category: r.category,
        type: r.type,
        title: r.title,
        description: r.description,
        url: r.url,
        priority: Number(r.priority),
        repeat_days: Number(r.repeat_days),
        repeat_months: Number(r.repeat_months),
      })),
    }))

    res.json({ list: shapeListMeta(meta.rows[0]), categories })
  } catch (err) {
    console.error('[shared/lists/:slug] failed:', err)
    res.status(500).json({ error: 'shared_list_lookup_failed' })
  }
})

// POST /api/shared/lists/:slug/clone — copy into the calling user's todos
router.post('/lists/:slug/clone', async (req, res) => {
  if (!ensurePro(req, res)) return
  const userId = req.userId!
  const { listName: requestedListName } = (req.body ?? {}) as { listName?: string }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const meta = await client.query<{ id: number; name: string; original_list_name: string }>(
      `SELECT id, name, original_list_name FROM shared_lists
        WHERE slug = $1 AND is_published = TRUE
          AND (is_hidden = FALSE OR owner_user_id = $2)`,
      [req.params.slug, userId]
    )
    if (meta.rowCount === 0) {
      await client.query('ROLLBACK')
      res.status(404).json({ error: 'not_found' })
      return
    }
    const sharedListId = meta.rows[0].id

    const items = await client.query<SharedItemRow>(
      `SELECT id, category, type, title, description, url, priority, repeat_days, repeat_months, sort_order
         FROM shared_items WHERE shared_list_id = $1
         ORDER BY category, sort_order, id`,
      [sharedListId]
    )

    if (items.rowCount === 0) {
      await client.query('ROLLBACK')
      res.status(400).json({ error: 'empty_list' })
      return
    }

    const baseName =
      (typeof requestedListName === 'string' && requestedListName.trim()) ||
      meta.rows[0].name ||
      meta.rows[0].original_list_name

    const existingNames = await client.query<{ list_name: string }>(
      `SELECT DISTINCT list_name FROM todos WHERE user_id = $1`,
      [userId]
    )
    const taken = new Set(existingNames.rows.map((r) => r.list_name))

    let finalName = baseName
    if (taken.has(finalName)) {
      let n = 2
      while (taken.has(`${baseName} (copy${n === 2 ? '' : ` ${n}`})`)) n++
      finalName = `${baseName} (copy${n === 2 ? '' : ` ${n}`})`
    }

    const nowSeconds = Math.floor(Date.now() / 1000)
    let inserted = 0
    for (const item of items.rows) {
      // Push the first occurrence one full period into the future so cloned
      // recurring items aren't instantly overdue. Subsequent occurrences are
      // handled by spawnRepeatingTodos as items get completed.
      const repeatDays = Number(item.repeat_days) || 0
      const repeatMonths = Number(item.repeat_months) || 0
      let dueDate: number | null = null
      if (repeatDays > 0) {
        dueDate = nowSeconds + repeatDays * 86400
      } else if (repeatMonths > 0) {
        dueDate = addMonths(nowSeconds, repeatMonths)
      }

      await client.query(
        `INSERT INTO todos
           (user_id, list_name, title, description, category, priority, status,
            due_date, repeat_days, repeat_months, spawned_next, type, url)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, 0, $10, $11)`,
        [
          userId,
          finalName,
          item.title,
          item.description ?? '',
          item.category || 'General',
          Number(item.priority) || 2,
          dueDate,
          repeatDays,
          repeatMonths,
          item.type,
          item.url,
        ]
      )
      inserted++
    }

    await client.query('COMMIT')
    res.json({ list_name: finalName, inserted_count: inserted })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[shared/clone] failed:', err)
    res.status(500).json({ error: 'clone_failed' })
  } finally {
    client.release()
  }
})

interface PublishBody {
  listName?: string
  name?: string
  description?: string
  icon?: string
  category?: string
}

// POST /api/shared/publish — snapshot the user's list to the community catalogue
router.post('/publish', async (req, res) => {
  if (!ensurePro(req, res)) return
  const userId = req.userId!
  if (userId === STASH_SQUIRREL_USER_ID) {
    res.status(403).json({ error: 'system_account_cannot_publish' })
    return
  }
  // Demo visitors have tier='pro' so they pass ensurePro, but they shouldn't
  // be able to push content onto the public Discover feed — their lists
  // would be public until cleanup deletes them (cascading shared_lists),
  // creating a window for spam/test/offensive content to be visible.
  if (userId.startsWith('demo-')) {
    res.status(403).json({ error: 'demo_cannot_publish' })
    return
  }

  const { listName, name, description, icon, category } = (req.body ?? {}) as PublishBody
  if (!listName || !listName.trim()) {
    res.status(400).json({ error: 'listName_required' })
    return
  }
  const trimmedListName = listName.trim()
  const finalCategory = isListCategory(category) ? category : 'Other'

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const todos = await client.query<{
      type: string
      title: string
      description: string
      category: string
      url: string | null
      priority: number
      repeat_days: number
      repeat_months: number
      id: number
    }>(
      `SELECT id, type, title, description, category, url, priority, repeat_days, repeat_months
         FROM todos
         WHERE user_id = $1 AND list_name = $2 AND type <> 'event' AND status = 0
         ORDER BY id`,
      [userId, trimmedListName]
    )

    if (todos.rowCount === 0) {
      await client.query('ROLLBACK')
      res.status(400).json({ error: 'list_empty_or_missing' })
      return
    }

    const existing = await client.query<{ id: number; slug: string }>(
      `SELECT id, slug FROM shared_lists
        WHERE owner_user_id = $1 AND original_list_name = $2`,
      [userId, trimmedListName]
    )

    const finalName = (name && name.trim()) || trimmedListName
    const finalDescription = (description ?? '').toString().slice(0, 500)
    const finalIcon = (icon ?? '').toString().slice(0, 20)

    let sharedListId: number
    let slug: string

    if (existing.rowCount && existing.rows[0]) {
      sharedListId = existing.rows[0].id
      slug = existing.rows[0].slug
      await client.query(
        `UPDATE shared_lists
            SET name = $1, description = $2, icon = $3, category = $4,
                is_published = TRUE, updated_at = NOW()
          WHERE id = $5`,
        [finalName, finalDescription, finalIcon, finalCategory, sharedListId]
      )
      await client.query(`DELETE FROM shared_items WHERE shared_list_id = $1`, [sharedListId])
    } else {
      const baseSlug = slugify(`${slugify(trimmedListName)}-${userId.slice(-6)}`)
      slug = baseSlug
      let collisionCounter = 1
      while (true) {
        const conflict = await client.query<{ id: number }>(
          `SELECT id FROM shared_lists WHERE slug = $1`,
          [slug]
        )
        if (conflict.rowCount === 0) break
        collisionCounter++
        slug = `${baseSlug}-${collisionCounter}`
      }
      const insertResult = await client.query<{ id: number }>(
        `INSERT INTO shared_lists
           (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0)
         RETURNING id`,
        [slug, finalName, finalDescription, finalIcon, finalCategory, userId, trimmedListName]
      )
      sharedListId = insertResult.rows[0].id
    }

    let sortOrder = 0
    for (const t of todos.rows) {
      await client.query(
        `INSERT INTO shared_items
           (shared_list_id, category, type, title, description, url, priority, repeat_days, repeat_months, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sharedListId,
          t.category || 'General',
          t.type,
          t.title,
          t.description ?? '',
          t.url ?? null,
          Number(t.priority) || 2,
          Number(t.repeat_days) || 0,
          Number(t.repeat_months) || 0,
          sortOrder++,
        ]
      )
    }

    await client.query('COMMIT')
    res.json({ slug, item_count: todos.rowCount, updated: (existing.rowCount ?? 0) > 0 })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[shared/publish] failed:', err)
    res.status(500).json({ error: 'publish_failed' })
  } finally {
    client.release()
  }
})

// DELETE /api/shared/lists/:slug — owner-only unpublish (cascades to items)
router.delete('/lists/:slug', async (req, res) => {
  if (!ensurePro(req, res)) return
  const userId = req.userId!
  try {
    const result = await query(
      `DELETE FROM shared_lists WHERE slug = $1 AND owner_user_id = $2`,
      [req.params.slug, userId]
    )
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'not_found_or_not_owner' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('[shared/lists/:slug DELETE] failed:', err)
    res.status(500).json({ error: 'unpublish_failed' })
  }
})

/**
 * Resolves a slug to a visible list. Hidden and unpublished lists 404 exactly
 * as unknown ones do — a reader who can't see a list shouldn't be able to
 * confirm it exists, and a moderated list shouldn't be actionable.
 */
async function findVisibleList(slug: string) {
  const { rows } = await query<{ id: number; owner_user_id: string }>(
    `SELECT id, owner_user_id FROM shared_lists
      WHERE slug = $1 AND is_published = TRUE AND is_hidden = FALSE`,
    [slug]
  )
  return rows[0] ?? null
}

// POST /api/shared/lists/:slug/report — flag a list for moderator attention
router.post('/lists/:slug/report', async (req, res) => {
  if (!ensurePro(req, res)) return
  const userId = req.userId!

  // Demo visitors browse Discover (tier='pro') but mustn't file reports: their
  // accounts are swept after 24h, so the reports would be noise from nobody.
  // Note demoNoop already fakes a 200 for the `demo-user` template, so this
  // only ever fires for the ephemeral demo-<uuid> users.
  if (isReservedUser(userId)) {
    res.status(403).json({ error: 'demo_cannot_report' })
    return
  }

  const reason = req.body?.reason
  if (!isReportReason(reason)) {
    res.status(400).json({ error: 'invalid_reason', allowed: REPORT_REASONS })
    return
  }
  const detail = String(req.body?.detail ?? '').trim().slice(0, MAX_REPORT_DETAIL)

  try {
    const list = await findVisibleList(req.params.slug)
    if (!list) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    if (list.owner_user_id === userId) {
      res.status(400).json({ error: 'cannot_report_own_list' })
      return
    }

    // ON CONFLICT on (shared_list_id, reporter_user_id): a second report from
    // the same person is a no-op, and the response is identical either way so
    // it never leaks whether one already existed.
    await query(
      `INSERT INTO shared_list_reports (shared_list_id, reporter_user_id, reason, detail)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (shared_list_id, reporter_user_id) DO NOTHING`,
      [list.id, userId, reason, detail]
    )
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('[shared/report] failed:', err)
    res.status(500).json({ error: 'report_failed' })
  }
})

// POST /api/shared/lists/:slug/like — toggle the caller's like
router.post('/lists/:slug/like', async (req, res) => {
  if (!ensurePro(req, res)) return
  const userId = req.userId!

  // A like is a ranking signal, so it has to come from an account that will
  // still exist tomorrow.
  if (isReservedUser(userId)) {
    res.status(403).json({ error: 'demo_cannot_like' })
    return
  }

  try {
    const list = await findVisibleList(req.params.slug)
    if (!list) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    // Publishers voting for themselves is the first thing anyone tries.
    if (list.owner_user_id === userId) {
      res.status(400).json({ error: 'cannot_like_own_list' })
      return
    }

    // Toggle, same shape as POST /api/blog/:slug/react: delete first, and if
    // nothing was there, insert.
    const removed = await query(
      `DELETE FROM shared_list_likes WHERE shared_list_id = $1 AND user_id = $2`,
      [list.id, userId]
    )
    if (removed.rowCount === 0) {
      await query(
        `INSERT INTO shared_list_likes (shared_list_id, user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [list.id, userId]
      )
    }

    // Return the settled state so the client never has to guess at it.
    const { rows } = await query<{ n: string; mine: boolean }>(
      `SELECT COUNT(*) AS n,
              BOOL_OR(user_id = $2) AS mine
         FROM shared_list_likes WHERE shared_list_id = $1`,
      [list.id, userId]
    )
    res.json({
      like_count: Number(rows[0]?.n ?? 0),
      liked_by_me: !!rows[0]?.mine,
    })
  } catch (err) {
    console.error('[shared/like] failed:', err)
    res.status(500).json({ error: 'like_failed' })
  }
})

// GET /api/shared/publications — community copies of all the caller's lists
router.get('/publications', async (req, res) => {
  if (!ensurePro(req, res)) return
  const userId = req.userId!
  try {
    const result = await query<{
      original_list_name: string
      slug: string
      updated_at: Date | string
    }>(
      `SELECT original_list_name, slug, updated_at FROM shared_lists
        WHERE owner_user_id = $1 AND is_published = TRUE`,
      [userId]
    )
    res.json({
      publications: result.rows.map((r) => ({
        list_name: r.original_list_name,
        slug: r.slug,
        updated_at: typeof r.updated_at === 'string' ? r.updated_at : r.updated_at.toISOString(),
      })),
    })
  } catch (err) {
    console.error('[shared/publications] failed:', err)
    res.status(500).json({ error: 'publications_lookup_failed' })
  }
})

// GET /api/shared/publication-status?listName=X — does the caller have a community copy of this list?
router.get('/publication-status', async (req, res) => {
  if (!ensurePro(req, res)) return
  const userId = req.userId!
  const listName = (req.query.listName as string | undefined)?.trim()
  if (!listName) {
    res.status(400).json({ error: 'listName_required' })
    return
  }
  try {
    const result = await query<{ slug: string; updated_at: Date | string; category: string }>(
      `SELECT slug, updated_at, category FROM shared_lists
        WHERE owner_user_id = $1 AND original_list_name = $2`,
      [userId, listName]
    )
    if (result.rowCount === 0) {
      res.json({ published: false })
      return
    }
    const row = result.rows[0]
    res.json({
      published: true,
      slug: row.slug,
      category: row.category,
      updated_at: typeof row.updated_at === 'string' ? row.updated_at : row.updated_at.toISOString(),
    })
  } catch (err) {
    console.error('[shared/publication-status] failed:', err)
    res.status(500).json({ error: 'status_lookup_failed' })
  }
})

export default router
