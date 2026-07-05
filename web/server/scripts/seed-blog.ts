/**
 * Seed (upsert) the blog from Markdown files in server/content/blog/.
 *
 * Usage:  npm run db:seed-blog            (local DB)
 *         npm run seed-blog:prod          (remote, sets ALLOW_REMOTE_DB=1)
 *
 * Each .md file carries its own front-matter (title/slug/summary/published/date).
 * Upsert-by-slug means running this repeatedly edits posts in place rather than
 * duplicating them, and honours each file's `date:` for the publish date.
 */

// Same env-precedence guard as run-migrations.ts: for local runs, .env must win
// over any stale DATABASE_URL exported by the shell. Must happen BEFORE importing
// db.js (which builds its pool at module load), so imports are dynamic in main().
import dotenv from 'dotenv'
if (process.env.ALLOW_REMOTE_DB !== '1') {
  delete process.env.DATABASE_URL
}
dotenv.config()

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const contentDir = path.join(__dirname, '..', 'content', 'blog')

const AUTHOR_EMAIL = process.env.BLOG_AUTHOR_EMAIL ?? 'support@stash-squirrel.com'

function guardTargetDb() {
  const url = process.env.DATABASE_URL
  if (!url) return // db.ts will error out cleanly
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (isLocal) {
    console.log(`→ Seeding blog into local DB (${host})`)
    return
  }
  if (process.env.ALLOW_REMOTE_DB === '1') {
    console.log(`→ Seeding blog into REMOTE DB (${host}) — ALLOW_REMOTE_DB is set`)
    return
  }
  console.error(
    `Refusing to seed: DATABASE_URL points at ${host}, not localhost.\n` +
    `If this is intentional, use \`npm run seed-blog:prod\`.\n` +
    `If your shell still exports a stale DATABASE_URL, run \`unset DATABASE_URL\` and try again.`
  )
  process.exit(1)
}

async function main() {
  guardTargetDb()
  const { parseFrontmatter } = await import('../lib/frontmatter.js')
  const { upsertBlogPost } = await import('../lib/blogPosts.js')
  const { pool } = await import('../db.js')

  try {
    const files = (await fs.readdir(contentDir)).filter((f) => f.endsWith('.md')).sort()
    if (files.length === 0) {
      console.log('No .md files found in server/content/blog/ — nothing to seed.')
      return
    }
    for (const file of files) {
      const raw = await fs.readFile(path.join(contentDir, file), 'utf8')
      const parsed = parseFrontmatter(raw)
      const post = await upsertBlogPost(parsed, AUTHOR_EMAIL)
      const when = post.published_at
        ? new Date(post.published_at).toISOString().slice(0, 10)
        : 'draft'
      console.log(`seed  ${post.slug.padEnd(28)} ${when}  ${post.is_published ? '' : '(draft)'}`)
    }
    console.log(`\nSeeded ${files.length} post(s).`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
