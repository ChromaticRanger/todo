import { query } from '../db.js'
import type { ParsedPost } from './frontmatter.js'

// Shared blog upsert, used by both the admin upload route and the seed script.
// Upsert-by-slug means re-uploading (or re-seeding) the same slug edits the post
// in place rather than creating a duplicate.

export interface BlogPostRow {
  id: number
  slug: string
  title: string
  summary: string
  is_published: boolean
  published_at: Date | null
  updated_at: Date
}

export async function upsertBlogPost(
  parsed: ParsedPost,
  authorEmail: string
): Promise<BlogPostRow> {
  // published_at rules:
  //  - New published post: use the front-matter date if given, else NOW().
  //  - Re-uploading an already-published post: keep its original date.
  //  - Unpublished: NULL.
  const { rows } = await query<BlogPostRow>(
    `INSERT INTO blog_posts (slug, title, summary, body, author_email, is_published, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN COALESCE($7::timestamptz, NOW()) ELSE NULL END)
     ON CONFLICT (slug) DO UPDATE SET
       title        = EXCLUDED.title,
       summary      = EXCLUDED.summary,
       body         = EXCLUDED.body,
       author_email = EXCLUDED.author_email,
       is_published = EXCLUDED.is_published,
       published_at = CASE
         WHEN EXCLUDED.is_published AND blog_posts.published_at IS NULL THEN EXCLUDED.published_at
         WHEN NOT EXCLUDED.is_published THEN NULL
         ELSE blog_posts.published_at
       END,
       updated_at   = NOW()
     RETURNING id, slug, title, summary, is_published, published_at, updated_at`,
    [parsed.slug, parsed.title, parsed.summary, parsed.body, authorEmail, parsed.published, parsed.date]
  )
  return rows[0]
}
