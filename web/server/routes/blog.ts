import { Router } from 'express'
import { query } from '../db.js'
import { isAdminEmail } from '../middleware/requireAdmin.js'

const router = Router()

// Blog reads live behind authMiddleware (so req.userId is always set) but ahead
// of requirePlan — any signed-in user of any tier can read updates. Content is
// global/admin-authored (see migration 030), so there is NO user_id filter on
// blog_posts; user_id only scopes a reader's own reaction rows.

// Resolve the caller's email so admins can preview unpublished drafts. Cheaper
// than a second Better Auth session decode, and userId already came from a
// validated session upstream.
async function isRequesterAdmin(userId: string): Promise<boolean> {
  const { rows } = await query<{ email: string }>(
    `SELECT email FROM "user" WHERE id = $1`,
    [userId]
  )
  return isAdminEmail(rows[0]?.email)
}

interface NeighbourRow {
  slug: string
  title: string
}

interface PostRow {
  id: number
  slug: string
  title: string
  summary: string
  body: string
  author_email: string
  is_published: boolean
  published_at: Date | null
  likes: string
  loves: string
}

const REACTION_COUNTS = `
  COALESCE(SUM(CASE WHEN r.reaction = 'like' THEN 1 ELSE 0 END), 0)::TEXT AS likes,
  COALESCE(SUM(CASE WHEN r.reaction = 'love' THEN 1 ELSE 0 END), 0)::TEXT AS loves`

function shapePost(row: PostRow, myReactions: string[] = []) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    body: row.body,
    authorEmail: row.author_email,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    reactions: {
      like: Number(row.likes),
      love: Number(row.loves),
    },
    myReactions,
  }
}

// GET /api/blog — list posts (newest first). Admins also see drafts.
router.get('/', async (req, res) => {
  const userId = req.userId!
  try {
    const admin = await isRequesterAdmin(userId)
    const { rows } = await query<PostRow>(
      `SELECT p.id, p.slug, p.title, p.summary, '' AS body, p.author_email,
              p.is_published, p.published_at, ${REACTION_COUNTS}
         FROM blog_posts p
         LEFT JOIN blog_post_reactions r ON r.post_id = p.id
        ${admin ? '' : 'WHERE p.is_published = TRUE'}
        GROUP BY p.id
        ORDER BY p.is_published ASC, COALESCE(p.published_at, p.created_at) DESC`,
      []
    )
    res.json({ posts: rows.map((r) => shapePost(r)), isAdmin: admin })
  } catch (err) {
    console.error('[blog] list failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/blog/:slug — single post with body + reaction state.
router.get('/:slug', async (req, res) => {
  const userId = req.userId!
  const slug = req.params.slug
  try {
    const { rows } = await query<PostRow>(
      `SELECT p.id, p.slug, p.title, p.summary, p.body, p.author_email,
              p.is_published, p.published_at, ${REACTION_COUNTS}
         FROM blog_posts p
         LEFT JOIN blog_post_reactions r ON r.post_id = p.id
        WHERE p.slug = $1
        GROUP BY p.id`,
      [slug]
    )
    const post = rows[0]
    if (!post) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    if (!post.is_published && !(await isRequesterAdmin(userId))) {
      res.status(404).json({ error: 'not_found' })
      return
    }
    const mine = await query<{ reaction: string }>(
      `SELECT reaction FROM blog_post_reactions WHERE post_id = $1 AND user_id = $2`,
      [post.id, userId]
    )

    // Chronological neighbours (published posts only). "next" is the post one
    // step newer, "prev" the post one step older. Row-value comparison on
    // (published_at, id) gives a deterministic tiebreak on same-day posts. Only
    // meaningful for a published post — a draft has no place in the timeline.
    let prev: NeighbourRow | null = null
    let next: NeighbourRow | null = null
    if (post.is_published && post.published_at) {
      const [prevRes, nextRes] = await Promise.all([
        query<NeighbourRow>(
          `SELECT slug, title FROM blog_posts
            WHERE is_published = TRUE AND (published_at, id) < ($1, $2)
            ORDER BY published_at DESC, id DESC
            LIMIT 1`,
          [post.published_at, post.id]
        ),
        query<NeighbourRow>(
          `SELECT slug, title FROM blog_posts
            WHERE is_published = TRUE AND (published_at, id) > ($1, $2)
            ORDER BY published_at ASC, id ASC
            LIMIT 1`,
          [post.published_at, post.id]
        ),
      ])
      prev = prevRes.rows[0] ?? null
      next = nextRes.rows[0] ?? null
    }

    res.json({
      post: shapePost(post, mine.rows.map((r) => r.reaction)),
      neighbours: { prev, next },
    })
  } catch (err) {
    console.error('[blog] detail failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/blog/:slug/react — toggle a reaction for the current user.
router.post('/:slug/react', async (req, res) => {
  const userId = req.userId!
  const slug = req.params.slug
  const reaction = req.body?.reaction
  if (reaction !== 'like' && reaction !== 'love') {
    res.status(400).json({ error: 'reaction must be "like" or "love"' })
    return
  }
  try {
    const { rows: postRows } = await query<{ id: number; is_published: boolean }>(
      `SELECT id, is_published FROM blog_posts WHERE slug = $1`,
      [slug]
    )
    const post = postRows[0]
    // Only reactable if visible to this user (published, or the admin previewing).
    if (!post || (!post.is_published && !(await isRequesterAdmin(userId)))) {
      res.status(404).json({ error: 'not_found' })
      return
    }

    // Toggle: DELETE returns the row if it existed; otherwise INSERT it.
    const removed = await query(
      `DELETE FROM blog_post_reactions
        WHERE post_id = $1 AND user_id = $2 AND reaction = $3`,
      [post.id, userId, reaction]
    )
    if (removed.rowCount === 0) {
      await query(
        `INSERT INTO blog_post_reactions (post_id, user_id, reaction)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [post.id, userId, reaction]
      )
    }

    const [counts, mine] = await Promise.all([
      query<{ likes: string; loves: string }>(
        `SELECT ${REACTION_COUNTS} FROM blog_post_reactions r WHERE r.post_id = $1`,
        [post.id]
      ),
      query<{ reaction: string }>(
        `SELECT reaction FROM blog_post_reactions WHERE post_id = $1 AND user_id = $2`,
        [post.id, userId]
      ),
    ])
    res.json({
      reactions: {
        like: Number(counts.rows[0]?.likes ?? 0),
        love: Number(counts.rows[0]?.loves ?? 0),
      },
      myReactions: mine.rows.map((r) => r.reaction),
    })
  } catch (err) {
    console.error('[blog] react failed:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
