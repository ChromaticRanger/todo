import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '../db.js'

/**
 * Per-route page metadata for crawlers and link scrapers.
 *
 * The app is a single-page Vue build: every route is served the same
 * `dist/index.html`, so without this every URL on the site — the home page,
 * twelve blog posts, thirty-five help articles — presents an identical title
 * and description. Google executes JavaScript and eventually sees the real
 * page, but the scrapers behind Slack, X, LinkedIn, WhatsApp, Discord and
 * iMessage do not. They read the HTML as served and nothing else.
 *
 * So this resolves a pathname to its real title and summary, and index.ts
 * injects the result into the `<head>` before sending. It is deliberately not
 * a prerenderer: the body stays empty and the SPA boots as usual. It only
 * fixes what non-JavaScript clients can see.
 */

const SITE_NAME = 'Stash Squirrel'
const ORIGIN = process.env.PUBLIC_ORIGIN ?? 'https://stash-squirrel.com'
const DEFAULT_IMAGE = `${ORIGIN}/og-image.jpg`

const DEFAULT_TITLE = 'Stash Squirrel — a nest for your todos, bookmarks, and notes'
const DEFAULT_DESCRIPTION =
  'Keep todos, bookmarks and notes together in one list instead of scattered ' +
  'across four apps. Kanban boards, a calendar across every list, and lists ' +
  'you can share. Free to start.'

export interface PageMeta {
  title: string
  description: string
  canonical: string
  image: string
  /** Open Graph type — `article` for blog posts, `website` for everything else. */
  type: 'website' | 'article'
}

// ── Static routes ────────────────────────────────────────────────────────────

const STATIC_ROUTES: Record<string, { title: string; description: string }> = {
  '/': { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  '/blog': {
    title: `Blog — ${SITE_NAME}`,
    description:
      'Product updates and notes on building Stash Squirrel — what shipped, ' +
      'what broke, and why.',
  },
  '/help': {
    title: `Help centre — ${SITE_NAME}`,
    description:
      'Guides for lists, todos, bookmarks, notes, the calendar, sharing, ' +
      'Discover and the browser extension.',
  },
  '/login': {
    title: `Sign in — ${SITE_NAME}`,
    description: 'Sign in to your Stash Squirrel account.',
  },
}

// ── Help articles, read from the client content directory at startup ─────────
//
// The same markdown the client compiles in via import.meta.glob. Read here
// rather than duplicated into a build artefact so a new article needs no extra
// step — write the file and both sides pick it up.

const helpMeta = new Map<string, { title: string; description: string }>()

function loadHelpArticles(): void {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const root = path.join(here, '../../src/content/help')
  let sections: string[]
  try {
    sections = fs.readdirSync(root)
  } catch {
    // Not fatal: the site still serves, it just falls back to the default
    // description for /help/* URLs.
    console.warn('[pageMeta] help content not found at', root)
    return
  }
  for (const section of sections) {
    const dir = path.join(root, section)
    if (!fs.statSync(dir).isDirectory()) continue
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md')) continue
      const raw = fs.readFileSync(path.join(dir, file), 'utf8')
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
      if (!fm) continue
      const title = /^title:\s*(.+)$/m.exec(fm[1])?.[1]?.trim()
      const summary = /^summary:\s*(.+)$/m.exec(fm[1])?.[1]?.trim()
      if (!title) continue
      const slug = file.replace(/\.md$/, '')
      helpMeta.set(`/help/${section}/${slug}`, {
        title: `${title} — ${SITE_NAME} help`,
        description: summary || DEFAULT_DESCRIPTION,
      })
    }
  }
  console.log(`[pageMeta] ${helpMeta.size} help articles indexed`)
}

loadHelpArticles()

/** Every help route we know about — used to build the sitemap. */
export function helpRoutes(): string[] {
  return [...helpMeta.keys()]
}

// ── Resolution ───────────────────────────────────────────────────────────────

function shape(
  pathname: string,
  m: { title: string; description: string },
  type: PageMeta['type'] = 'website'
): PageMeta {
  return {
    title: m.title,
    description: m.description,
    canonical: `${ORIGIN}${pathname === '/' ? '/' : pathname.replace(/\/$/, '')}`,
    image: DEFAULT_IMAGE,
    type,
  }
}

export async function resolvePageMeta(pathname: string): Promise<PageMeta> {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  const staticMeta = STATIC_ROUTES[clean]
  if (staticMeta) return shape(clean, staticMeta)

  const help = helpMeta.get(clean)
  if (help) return shape(clean, help)

  // Help section index — no per-section copy, so lean on the hub description.
  if (/^\/help\/[^/]+$/.test(clean)) return shape(clean, STATIC_ROUTES['/help'])

  const blog = /^\/blog\/([a-z0-9-]+)$/.exec(clean)
  if (blog) {
    try {
      const { rows } = await query<{ title: string; summary: string }>(
        `SELECT title, summary FROM blog_posts
          WHERE slug = $1 AND is_published = TRUE`,
        [blog[1]]
      )
      if (rows[0]) {
        return shape(
          clean,
          {
            title: `${rows[0].title} — ${SITE_NAME}`,
            description: rows[0].summary || DEFAULT_DESCRIPTION,
          },
          'article'
        )
      }
    } catch (err) {
      // A metadata lookup must never stop the page being served.
      console.error('[pageMeta] blog lookup failed:', err)
    }
  }

  // Unknown path. The catch-all serves the app for any URL, so pointing the
  // canonical at itself would invite crawlers to index typos and junk links as
  // separate pages. Point them at the home page instead.
  return {
    ...shape('/', { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION }),
  }
}

// ── Sitemap ──────────────────────────────────────────────────────────────────

/**
 * Built on request rather than checked in as a static file. The previous
 * public/sitemap.xml listed the home page, the blog index and twelve posts,
 * and omitted all thirty-five help articles — which are the long-tail pages
 * most likely to be searched for. Generating it means a new help article or
 * blog post is listed the moment it exists, with nothing to remember.
 */
export async function buildSitemap(): Promise<string> {
  const entries: { loc: string; priority: string; changefreq: string; lastmod?: string }[] = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/blog', priority: '0.8', changefreq: 'weekly' },
    { loc: '/help', priority: '0.8', changefreq: 'monthly' },
    { loc: '/privacy', priority: '0.3', changefreq: 'yearly' },
  ]

  try {
    const { rows } = await query<{ slug: string; published_at: Date | null }>(
      `SELECT slug, published_at FROM blog_posts
        WHERE is_published = TRUE ORDER BY published_at DESC`
    )
    for (const r of rows) {
      entries.push({
        loc: `/blog/${r.slug}`,
        priority: '0.6',
        changefreq: 'monthly',
        lastmod: r.published_at ? new Date(r.published_at).toISOString().slice(0, 10) : undefined,
      })
    }
  } catch (err) {
    // A sitemap missing its blog section beats a 500.
    console.error('[sitemap] blog lookup failed:', err)
  }

  for (const route of helpRoutes()) {
    entries.push({ loc: route, priority: '0.5', changefreq: 'monthly' })
  }

  const urls = entries
    .map((e) => {
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''
      return `  <url>\n    <loc>${ORIGIN}${e.loc}</loc>${lastmod}\n    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

// ── Injection ────────────────────────────────────────────────────────────────

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Replaces the shell's title/description and appends the social tags.
 *
 * index.html carries a baseline set so that a dev server, or any path this
 * misses, still shares sensibly; those are stripped here before the real ones
 * go in, so a page never ends up with two `og:title`s.
 */
export function injectMeta(html: string, meta: PageMeta): string {
  const tags = [
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
    `<link rel="canonical" href="${escapeAttr(meta.canonical)}" />`,
    `<meta property="og:type" content="${meta.type}" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:url" content="${escapeAttr(meta.canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(meta.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(meta.image)}" />`,
  ].join('\n    ')

  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(meta.title)}</title>`)
    .replace(/\s*<meta name="description"[^>]*>/g, '')
    .replace(/\s*<meta property="og:[^>]*>/g, '')
    .replace(/\s*<meta name="twitter:[^>]*>/g, '')
    .replace(/\s*<link rel="canonical"[^>]*>/g, '')
    .replace('</head>', `  ${tags}\n  </head>`)
}
