// Static help content — checked-in markdown, one file per topic, loaded at
// build time. Docs version with the code: a PR that changes a feature updates
// its help article in the same diff. See src/content/help/.

export interface HelpTopic {
  slug: string
  section: string
  title: string
  summary: string
  /** Account level the feature needs. */
  plan: 'free' | 'pro'
  order: number
  /** Markdown body (frontmatter stripped). */
  body: string
}

export interface HelpSection {
  slug: string
  title: string
  blurb: string
  topics: HelpTopic[]
}

const SECTION_META: { slug: string; title: string; blurb: string }[] = [
  { slug: 'getting-started', title: 'Getting Started', blurb: 'Accounts, plans, the demo and your first list.' },
  { slug: 'todos', title: 'Todos', blurb: 'Creating tasks, priorities, due dates, repeats and snoozing.' },
  { slug: 'bookmarks-notes', title: 'Bookmarks & Notes', blurb: 'Saving links and writing markdown notes.' },
  { slug: 'lists-categories', title: 'Lists & Categories', blurb: 'Organising your items and moving things around.' },
  { slug: 'views-layouts', title: 'Views & Layouts', blurb: 'Time-windowed views, grid vs kanban, drag & drop.' },
  { slug: 'calendar-events', title: 'Calendar & Events', blurb: 'The Overall Schedule and time-blocked events.' },
  { slug: 'search-discover', title: 'Search & Discover', blurb: 'Finding anything fast and sharing lists with the community.' },
  { slug: 'import-extension', title: 'Import & Browser Extension', blurb: 'Bringing bookmarks in from your browser.' },
  { slug: 'account-billing', title: 'Account, Plans & Billing', blurb: 'Your profile, upgrading, invoices and account deletion.' },
  { slug: 'settings-shortcuts', title: 'Settings & Shortcuts', blurb: 'Themes, reminders, preferences and keyboard shortcuts.' },
]

// ── Frontmatter parsing ─────────────────────────────────────────────────────

interface Frontmatter {
  title: string
  summary: string
  plan: 'free' | 'pro'
  order: number
}

function parseTopic(raw: string): { meta: Frontmatter; body: string } | null {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
  if (!match) return null
  const meta: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  if (!meta.title) return null
  return {
    meta: {
      title: meta.title,
      summary: meta.summary ?? '',
      plan: meta.plan === 'pro' ? 'pro' : 'free',
      order: Number(meta.order) || 999,
    },
    body: raw.slice(match[0].length),
  }
}

// ── Build the section tree once at module load ──────────────────────────────

const files = import.meta.glob('../content/help/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const topicsBySection = new Map<string, HelpTopic[]>()

for (const [path, raw] of Object.entries(files)) {
  // path: ../content/help/<section>/<topic>.md
  const parts = path.split('/')
  const section = parts[parts.length - 2]
  const slug = parts[parts.length - 1].replace(/\.md$/, '')
  const parsed = parseTopic(raw)
  if (!parsed) {
    console.warn(`[help] skipping ${path}: missing or invalid frontmatter`)
    continue
  }
  const topic: HelpTopic = { slug, section, ...parsed.meta, body: parsed.body }
  const bucket = topicsBySection.get(section)
  if (bucket) bucket.push(topic)
  else topicsBySection.set(section, [topic])
}

export const helpSections: HelpSection[] = SECTION_META.map((s) => ({
  ...s,
  topics: (topicsBySection.get(s.slug) ?? []).sort((a, b) => a.order - b.order),
})).filter((s) => s.topics.length > 0)

export function findSection(slug: string): HelpSection | undefined {
  return helpSections.find((s) => s.slug === slug)
}

export function findTopic(sectionSlug: string, topicSlug: string): HelpTopic | undefined {
  return findSection(sectionSlug)?.topics.find((t) => t.slug === topicSlug)
}

/** Case-insensitive filter over title + summary, across all sections. */
export function filterTopics(term: string): HelpTopic[] {
  const q = term.trim().toLowerCase()
  if (!q) return []
  return helpSections.flatMap((s) =>
    s.topics.filter(
      (t) => t.title.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)
    )
  )
}
