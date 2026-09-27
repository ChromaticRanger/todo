/**
 * Seed (or reseed) the shared demo account used by the marketing "See it in
 * action" CTA. Idempotent: wipes the demo user's data and recreates it from
 * the curated content below.
 *
 * Usage: `npm run seed:demo` (local) or `npm run seed:demo:prod` (production,
 * sets ALLOW_REMOTE_DB=1 so the safety guard in db.ts permits a remote host).
 *
 * The demo user is `id = 'demo-user'` (constant string, simpler than a UUID).
 * Better Auth treats `user.id` as plain text so any unique string works.
 */

// .env must beat any stale shell-exported DATABASE_URL for local seeding.
// `seed:demo:prod` opts in via ALLOW_REMOTE_DB=1 to use prod creds.
import dotenv from 'dotenv'
if (process.env.ALLOW_REMOTE_DB !== '1') {
  delete process.env.DATABASE_URL
}
dotenv.config()

import crypto from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'

// ── Constants ───────────────────────────────────────────────────────────────
export const DEMO_USER_ID = 'demo-user'
export const DEMO_USER_EMAIL = 'demo@stash-squirrel.com'
export const DEMO_USER_NAME = 'Demo'

const DAY = 86400

// Mirror of COLOR_KEYS in server/routes/todos.ts and EVENT_COLORS in
// src/lib/eventColor.ts. Restated rather than imported: importing the route
// module would pull in server/db.ts, which reads DATABASE_URL at module scope,
// and this script defers that deliberately (see the dynamic import in main()).
type EventColor =
  | 'rose' | 'amber' | 'emerald' | 'sky'
  | 'violet' | 'fuchsia' | 'teal' | 'orange'

function guardTargetDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL not set')
    process.exit(1)
  }
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (isLocal) {
    console.log(`→ Seeding demo into local DB (${host})`)
    return
  }
  if (process.env.ALLOW_REMOTE_DB === '1') {
    console.log(`→ Seeding demo into REMOTE DB (${host}) — ALLOW_REMOTE_DB is set`)
    return
  }
  console.error(
    `Refusing to seed: DATABASE_URL points at ${host}, not localhost.\n` +
    `Use \`npm run seed:demo:prod\` if prod is genuinely the target.`
  )
  process.exit(1)
}

// ── Time helpers for event seed dates ───────────────────────────────────────
// Everything is computed relative to "now" so the calendar always looks fresh.
// Returns epoch seconds.
function todayAt(hour: number, minute = 0): number {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return Math.floor(d.getTime() / 1000)
}
function inDaysAt(dayOffset: number, hour: number, minute = 0): number {
  return todayAt(hour, minute) + dayOffset * DAY
}
function nextWeekdayAt(targetDow: number, hour: number, minute = 0): number {
  // targetDow: 0=Sun..6=Sat (matching Date.getDay)
  const now = new Date()
  const today = now.getDay()
  let offset = (targetDow - today + 7) % 7
  if (offset === 0) offset = 7 // always pick the NEXT one, not today
  return inDaysAt(offset, hour, minute)
}

/**
 * Recurring events only expand FORWARD from their start date — see
 * expandEventOccurrences() in server/routes/todos.ts, which fast-forwards with
 * Math.max(0, skips) and never steps back. A weekly series seeded on "next
 * Monday" therefore leaves every earlier week of a month view empty, which is
 * what made the calendar look abandoned. Anchor the series in the past
 * instead — which is also simply truer: a weekly standup did not start next
 * week.
 */
function weekdayWeeksAgo(targetDow: number, weeksAgo: number, hour: number, minute = 0): number {
  return nextWeekdayAt(targetDow, hour, minute) - weeksAgo * 7 * DAY
}

/** A fixed day-of-month, `monthsAgo` months back — the anchor for a monthly series. */
function dayOfMonthAgo(day: number, monthsAgo: number, hour: number, minute = 0): number {
  const d = new Date()
  d.setMonth(d.getMonth() - monthsAgo, day)
  d.setHours(hour, minute, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

interface SeedTodo {
  list_name: string
  category: string
  title: string
  description?: string
  priority?: 1 | 2 | 3
  status?: 0 | 1
  due_date?: number | null
  completed_at_offset_days?: number // negative = days ago
  repeat_days?: number
  repeat_months?: number
  type: 'todo' | 'bookmark' | 'note' | 'event'
  url?: string | null
  duration_seconds?: number | null
  recur_until?: number | null
  /** Event-only. Drives the calendar's per-item colour; null = theme accent. */
  color?: EventColor
  /** Event-only. All-day events render as a bar in the week view's top lane. */
  all_day?: boolean
}

function buildSeed(): SeedTodo[] {
  return [
    // ── Home ──────────────────────────────────────────────────────────────
    {
      list_name: 'Home', category: 'Welcome', type: 'note',
      title: 'Welcome to the Stash Squirrel demo',
      description: [
        "![Stash Squirrel](/stash-squirrel.svg)",
        "",
        "This is a fully interactive demo account. Click around, drag, edit,",
        "complete, create — **everything works** the same as the real app, and",
        "your changes stick around through page refreshes too.",
        "",
        "## What to try",
        "",
        "- Right-click an empty cell on the **calendar** to add an event",
        "- Toggle between **Month** and **Week** view (top-right of the calendar)",
        "- Open the **Discover** tab and clone someone else's list into yours",
        "- Use `Cmd/Ctrl + K` to search across everything",
        "- Drag a category card to reorder your list",
        "",
        "## What happens at the end",
        "",
        "You have **30 minutes**. When the timer runs out — or any time before —",
        "you can sign up. Picking **Pro** keeps every list, todo, bookmark, note,",
        "and event you've built here. Picking **Free** starts fresh with a clean",
        "welcome list. Either way the demo account is cleaned up afterwards.",
        "",
        "_p.s. This note itself is Markdown — try editing it to see the source._",
      ].join('\n'),
      priority: 2,
    },
    {
      list_name: 'Home', category: 'Welcome', type: 'todo',
      title: 'Try right-clicking the calendar to add an event',
      priority: 3, due_date: inDaysAt(0, 18),
    },
    {
      list_name: 'Home', category: 'Welcome', type: 'todo',
      title: 'Toggle between Month and Week view (top right of calendar)',
      priority: 2, due_date: inDaysAt(0, 19),
    },
    {
      list_name: 'Home', category: 'Chores', type: 'todo',
      title: 'Take the bins out', priority: 2,
      due_date: nextWeekdayAt(2, 8), // Tuesday morning
      repeat_days: 7,
    },
    {
      list_name: 'Home', category: 'Chores', type: 'todo',
      title: 'Hoover the living room', priority: 1,
      due_date: nextWeekdayAt(6, 10),
      repeat_days: 7,
    },
    {
      list_name: 'Home', category: 'Errands', type: 'todo',
      title: "Pick up Mum's birthday card", priority: 3,
      due_date: inDaysAt(3, 17),
    },
    {
      list_name: 'Home', category: 'Errands', type: 'todo',
      title: 'Return library books', priority: 2,
      due_date: inDaysAt(5, 12),
    },
    {
      list_name: 'Home', category: 'Errands', type: 'todo',
      title: 'Pick up dry cleaning', priority: 1,
      status: 1, completed_at_offset_days: -1,
    },
    {
      list_name: 'Home', category: 'Health', type: 'todo',
      title: 'Renew gym membership', priority: 2,
      due_date: inDaysAt(7, 9),
    },
    {
      list_name: 'Home', category: 'Health', type: 'todo',
      title: '30-minute walk', priority: 1,
      due_date: inDaysAt(0, 17),
      repeat_days: 1,
    },

    // ── Reading List ──────────────────────────────────────────────────────
    {
      list_name: 'Reading List', category: 'Articles', type: 'bookmark',
      title: 'The Art of Doing Science and Engineering — Richard Hamming',
      url: 'https://press.stripe.com/the-art-of-doing-science-and-engineering',
    },
    {
      list_name: 'Reading List', category: 'Articles', type: 'bookmark',
      title: 'Programmers Should Stop Celebrating Incompetence',
      url: 'https://www.bryanbraun.com/2024/06/27/programmers-should-stop-celebrating-incompetence/',
    },
    {
      list_name: 'Reading List', category: 'Articles', type: 'bookmark',
      title: 'How to Write Usefully — Paul Graham',
      url: 'http://www.paulgraham.com/useful.html',
    },
    {
      list_name: 'Reading List', category: 'Tools', type: 'bookmark',
      title: 'Bun — a fast JavaScript runtime',
      url: 'https://bun.sh',
    },
    {
      list_name: 'Reading List', category: 'Tools', type: 'bookmark',
      title: 'Excalidraw — virtual whiteboard',
      url: 'https://excalidraw.com',
    },
    {
      list_name: 'Reading List', category: 'Videos', type: 'bookmark',
      title: 'Rich Hickey — Simple Made Easy',
      url: 'https://www.youtube.com/watch?v=SxdOUGdseq4',
    },
    {
      list_name: 'Reading List', category: 'Videos', type: 'note',
      title: 'Talks to rewatch this quarter',
      description:
        "1. Simple Made Easy (Hickey) — once a year, no exceptions.\n" +
        "2. The Wrong Abstraction (Metz).\n" +
        "3. The Mess We're In (Rich Hickey again, sorry).",
    },

    // ── Travel — Lisbon ───────────────────────────────────────────────────
    {
      list_name: 'Travel', category: 'Planning', type: 'todo',
      title: 'Book flights to Lisbon', priority: 3, status: 1,
      completed_at_offset_days: -10,
    },
    {
      list_name: 'Travel', category: 'Planning', type: 'todo',
      title: 'Confirm hotel reservation', priority: 3, status: 1,
      completed_at_offset_days: -8,
    },
    {
      list_name: 'Travel', category: 'Planning', type: 'todo',
      title: 'Get currency (€)', priority: 2,
      due_date: nextWeekdayAt(4, 12), // Thursday
    },
    {
      list_name: 'Travel', category: 'Planning', type: 'note',
      title: 'Packing list',
      description:
        "Light layers, walking shoes, sunscreen, swim things (the hotel has a pool).\n" +
        "Don't forget the adapter (Type F).",
    },
    {
      list_name: 'Travel', category: 'Places', type: 'bookmark',
      title: 'Time Out Market — central food hall',
      url: 'https://www.timeoutmarket.com/lisboa/en/',
    },
    {
      list_name: 'Travel', category: 'Places', type: 'bookmark',
      title: 'Belém Tower & Jerónimos Monastery',
      url: 'https://www.visitportugal.com/en/node/73776',
    },
    {
      list_name: 'Travel', category: 'Places', type: 'bookmark',
      title: 'Pastéis de Belém — the original',
      url: 'https://pasteisdebelem.pt/en/',
    },
    {
      list_name: 'Travel', category: 'Places', type: 'bookmark',
      title: 'LX Factory — design district & weekend market',
      url: 'https://lxfactory.com/en/',
    },

    // ── Recipes ───────────────────────────────────────────────────────────
    {
      list_name: 'Recipes', category: 'Weeknight', type: 'bookmark',
      title: 'Marcella Hazan tomato sauce',
      url: 'https://www.nytimes.com/recipes/11376/marcella-hazans-tomato-sauce.html',
    },
    {
      list_name: 'Recipes', category: 'Weeknight', type: 'bookmark',
      title: 'Smitten Kitchen — sheet pan chicken',
      url: 'https://smittenkitchen.com/2020/05/sheet-pan-chicken-tikka/',
    },
    {
      list_name: 'Recipes', category: 'Weekend', type: 'bookmark',
      title: 'Ottolenghi — caramelised onion & feta tart',
      url: 'https://ottolenghi.co.uk/pages/recipes/caramelised-onion-feta-tart',
    },
    {
      list_name: 'Recipes', category: 'Weekend', type: 'bookmark',
      title: 'Bon Appétit — best chocolate chip cookies',
      url: 'https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies',
    },
    {
      list_name: 'Recipes', category: 'Weekend', type: 'note',
      title: 'Sunday roast rotation',
      description:
        "Chicken with lemon & thyme (the easy one).\n" +
        "Slow roast pork shoulder (start 11am, eat 4pm).\n" +
        "Leg of lamb with anchovy & rosemary (special occasions).",
    },

    // ── Side project ──────────────────────────────────────────────────────
    // Built to photograph well as a kanban board, which is why it looks more
    // regular than the other lists: four categories of nine items each, so no
    // column towers over the rest.
    //
    // Text length is load-bearing here. A kanban column is `w-max min-w-52`
    // (CategoryGroup.vue) and sizes itself to its widest card, so the longest
    // title OR note description in a column sets that column's width. Four
    // columns have to fit a 1280px capture viewport, which means keeping
    // titles under ~20 characters and note descriptions under ~28. Lengthen
    // this copy and the fourth column slides off the edge of the screenshot.
    //
    // Mixed types on purpose: a board of identical todo cards doesn't show
    // that a list holds bookmarks and notes too. Column order is pinned via
    // category_order below; the default is alphabetical, which would open the
    // board on "Build".
    {
      list_name: 'Side project', category: 'Design', type: 'todo',
      title: 'Logo and wordmark',
    },
    {
      list_name: 'Side project', category: 'Design', type: 'bookmark',
      title: 'Colour palette',
      url: 'https://coolors.co/',
    },
    {
      list_name: 'Side project', category: 'Design', type: 'note',
      title: 'Voice and tone',
      description: 'Plain, playful, not salesy.',
    },
    {
      list_name: 'Side project', category: 'Design', type: 'todo',
      title: 'Wireframes',
      priority: 1,
    },
    {
      list_name: 'Side project', category: 'Design', type: 'todo',
      title: 'Pick a typeface',
    },
    {
      list_name: 'Side project', category: 'Design', type: 'bookmark',
      title: 'Icon set',
      url: 'https://lucide.dev/',
    },
    {
      list_name: 'Side project', category: 'Design', type: 'todo',
      title: 'Empty states',
    },
    {
      list_name: 'Side project', category: 'Design', type: 'todo',
      title: 'Dark mode pass',
    },
    {
      list_name: 'Side project', category: 'Design', type: 'bookmark',
      title: 'Unsplash',
      url: 'https://unsplash.com/',
    },

    {
      list_name: 'Side project', category: 'Build', type: 'todo',
      title: 'Stripe checkout',
      priority: 3,
    },
    {
      list_name: 'Side project', category: 'Build', type: 'todo',
      title: 'Email verification',
    },
    {
      list_name: 'Side project', category: 'Build', type: 'bookmark',
      title: 'Better Auth docs',
      url: 'https://www.better-auth.com/docs',
    },
    {
      list_name: 'Side project', category: 'Build', type: 'todo',
      title: 'API rate limiting',
      priority: 1,
    },
    {
      list_name: 'Side project', category: 'Build', type: 'todo',
      title: 'Seed the database',
    },
    {
      list_name: 'Side project', category: 'Build', type: 'note',
      title: 'Deploy steps',
      description: 'Migrate, then flip DNS.',
    },
    {
      list_name: 'Side project', category: 'Build', type: 'todo',
      title: 'Password reset',
    },
    {
      list_name: 'Side project', category: 'Build', type: 'todo',
      title: 'Error logging',
    },
    {
      list_name: 'Side project', category: 'Build', type: 'bookmark',
      title: 'Postgres docs',
      url: 'https://www.postgresql.org/docs/',
    },

    {
      list_name: 'Side project', category: 'Content', type: 'todo',
      title: 'Write the FAQ',
    },
    {
      list_name: 'Side project', category: 'Content', type: 'note',
      title: 'Launch post',
      description: 'Problem first, features after.',
    },
    {
      list_name: 'Side project', category: 'Content', type: 'bookmark',
      title: 'Plausible',
      url: 'https://plausible.io/',
    },
    {
      list_name: 'Side project', category: 'Content', type: 'todo',
      title: 'Record a 60s demo',
      priority: 1,
    },
    {
      list_name: 'Side project', category: 'Content', type: 'todo',
      title: 'Draft the changelog',
    },
    {
      list_name: 'Side project', category: 'Content', type: 'bookmark',
      title: 'Pricing examples',
      url: 'https://stripe.com/pricing',
    },
    {
      list_name: 'Side project', category: 'Content', type: 'todo',
      title: 'Alt text audit',
    },
    {
      list_name: 'Side project', category: 'Content', type: 'todo',
      title: 'Privacy policy',
    },
    {
      list_name: 'Side project', category: 'Content', type: 'bookmark',
      title: 'Hemingway',
      url: 'https://hemingwayapp.com/',
    },

    {
      list_name: 'Side project', category: 'Launch', type: 'todo',
      title: 'Post to Hacker News',
      priority: 3,
      due_date: inDaysAt(4, 9),
    },
    {
      list_name: 'Side project', category: 'Launch', type: 'todo',
      title: 'Email the beta list',
      due_date: inDaysAt(4, 11),
    },
    {
      list_name: 'Side project', category: 'Launch', type: 'bookmark',
      title: 'Product Hunt',
      url: 'https://www.producthunt.com/launch',
    },
    {
      list_name: 'Side project', category: 'Launch', type: 'note',
      title: 'Day-one metrics',
      description: 'Signups and activation.',
    },
    {
      list_name: 'Side project', category: 'Launch', type: 'todo',
      title: 'Reply to comments',
    },
    {
      list_name: 'Side project', category: 'Launch', type: 'todo',
      title: 'Thank the testers',
      priority: 1,
    },
    {
      list_name: 'Side project', category: 'Launch', type: 'todo',
      title: 'Press kit',
    },
    {
      list_name: 'Side project', category: 'Launch', type: 'todo',
      title: 'Post a retro',
    },
    {
      list_name: 'Side project', category: 'Launch', type: 'bookmark',
      title: 'Indie Hackers',
      url: 'https://www.indiehackers.com/',
    },

    // ── Bookmarks ─────────────────────────────────────────────────────────
    // A start-page style list: the sites you open every day, grouped. Pinned
    // to the grid layout below (list_prefs), because the default is kanban and
    // a wall of favicon tiles is the whole point of this one — it's what the
    // landing page's "Bookmarks" slide shows.
    //
    // Deliberately well-known sites: the favicon thumbnail is fetched from the
    // URL, so recognisable domains give the grid its colour. Six categories of
    // four fills a three-column masonry grid (columns-1 md:columns-2
    // xl:columns-3 in ListView.vue) at the 1280px capture width.
    {
      list_name: 'Bookmarks', category: 'Daily', type: 'bookmark',
      title: 'Gmail',
      url: 'https://mail.google.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Daily', type: 'bookmark',
      title: 'Google Calendar',
      url: 'https://calendar.google.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Daily', type: 'bookmark',
      title: 'Google Drive',
      url: 'https://drive.google.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Daily', type: 'bookmark',
      title: 'WhatsApp Web',
      url: 'https://web.whatsapp.com/',
    },

    {
      list_name: 'Bookmarks', category: 'Dev', type: 'bookmark',
      title: 'GitHub',
      url: 'https://github.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Dev', type: 'bookmark',
      title: 'Stack Overflow',
      url: 'https://stackoverflow.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Dev', type: 'bookmark',
      title: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/',
    },
    {
      list_name: 'Bookmarks', category: 'Dev', type: 'bookmark',
      title: 'npm',
      url: 'https://www.npmjs.com/',
    },

    {
      list_name: 'Bookmarks', category: 'News', type: 'bookmark',
      title: 'BBC News',
      url: 'https://www.bbc.co.uk/news',
    },
    {
      list_name: 'Bookmarks', category: 'News', type: 'bookmark',
      title: 'The Guardian',
      url: 'https://www.theguardian.com/',
    },
    {
      list_name: 'Bookmarks', category: 'News', type: 'bookmark',
      title: 'Hacker News',
      url: 'https://news.ycombinator.com/',
    },
    {
      list_name: 'Bookmarks', category: 'News', type: 'bookmark',
      title: 'Reuters',
      url: 'https://www.reuters.com/',
    },

    {
      list_name: 'Bookmarks', category: 'Watch & listen', type: 'bookmark',
      title: 'YouTube',
      url: 'https://www.youtube.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Watch & listen', type: 'bookmark',
      title: 'Netflix',
      url: 'https://www.netflix.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Watch & listen', type: 'bookmark',
      title: 'Spotify',
      url: 'https://open.spotify.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Watch & listen', type: 'bookmark',
      title: 'BBC iPlayer',
      url: 'https://www.bbc.co.uk/iplayer',
    },

    {
      list_name: 'Bookmarks', category: 'Social', type: 'bookmark',
      title: 'Reddit',
      url: 'https://www.reddit.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Social', type: 'bookmark',
      title: 'LinkedIn',
      url: 'https://www.linkedin.com/',
    },
    {
      list_name: 'Bookmarks', category: 'Social', type: 'bookmark',
      title: 'Bluesky',
      url: 'https://bsky.app/',
    },
    {
      list_name: 'Bookmarks', category: 'Social', type: 'bookmark',
      title: 'Mastodon',
      url: 'https://mastodon.social/',
    },

    {
      list_name: 'Bookmarks', category: 'AI', type: 'bookmark',
      title: 'Claude',
      url: 'https://claude.ai/',
    },
    {
      list_name: 'Bookmarks', category: 'AI', type: 'bookmark',
      title: 'ChatGPT',
      url: 'https://chatgpt.com/',
    },
    {
      list_name: 'Bookmarks', category: 'AI', type: 'bookmark',
      title: 'Perplexity',
      url: 'https://www.perplexity.ai/',
    },
    {
      list_name: 'Bookmarks', category: 'AI', type: 'bookmark',
      title: 'Hugging Face',
      url: 'https://huggingface.co/',
    },

    // ── Events (live on the calendar) ──────────────────────────────────────
    // Sized to make the Overall Schedule look like a calendar someone actually
    // uses: four weekly series carry the baseline density, the monthlies give
    // longer-range structure, and the one-offs are spread from roughly a week
    // behind "today" to three weeks ahead so every row of a month view has
    // something in it. Colours are spread across the palette on purpose —
    // work sky, health emerald, social amber, family rose, travel violet,
    // money/admin orange, personal teal — since an uncoloured calendar renders
    // every block in the theme accent and reads as a wall of one hue.
    //
    // Only [7,0], [0,1] and [0,12] are valid event recurrences — see
    // EVENT_RECURRENCE_PRESETS in server/routes/todos.ts. No fortnightly.

    // Weekly series
    {
      list_name: '', category: '', type: 'event',
      title: 'Team standup',
      due_date: weekdayWeeksAgo(1, 8, 9, 30), // Mondays, running for two months
      duration_seconds: 15 * 60,
      repeat_days: 7,
      color: 'sky',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Morning swim',
      due_date: weekdayWeeksAgo(3, 8, 7), // Wednesdays
      duration_seconds: 45 * 60,
      repeat_days: 7,
      color: 'emerald',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Sprint planning',
      description: 'Groom the backlog, size the next two weeks.',
      due_date: weekdayWeeksAgo(4, 8, 11), // Thursdays
      duration_seconds: 60 * 60,
      repeat_days: 7,
      color: 'sky',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Farmers market',
      due_date: weekdayWeeksAgo(6, 8, 9, 30), // Saturdays
      duration_seconds: 90 * 60,
      repeat_days: 7,
      color: 'teal',
    },

    // Monthly series
    {
      list_name: '', category: '', type: 'event',
      title: 'Monthly review & planning',
      due_date: dayOfMonthAgo(6, 2, 14), // the 6th, every month
      duration_seconds: 2 * 3600,
      repeat_months: 1,
      color: 'orange',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Rent due',
      due_date: dayOfMonthAgo(1, 2, 0), // the 1st, every month
      all_day: true,
      repeat_months: 1,
      color: 'orange',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Book club',
      description: 'This month: Piranesi.',
      due_date: dayOfMonthAgo(9, 2, 19, 30), // the 9th, every month
      duration_seconds: 2 * 3600,
      repeat_months: 1,
      color: 'violet',
    },

    // Behind us — shows past styling, and stops the month opening on a blank
    // first fortnight when "today" falls late in the month.
    {
      list_name: '', category: '', type: 'event',
      title: "Alex's leaving drinks",
      due_date: inDaysAt(-15, 19),
      duration_seconds: 3 * 3600,
      color: 'amber',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Flu jab',
      due_date: inDaysAt(-11, 9, 20),
      duration_seconds: 15 * 60,
      color: 'emerald',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Car MOT',
      due_date: inDaysAt(-8, 8, 30),
      duration_seconds: 60 * 60,
      color: 'orange',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Physio',
      due_date: inDaysAt(-4, 17, 15),
      duration_seconds: 45 * 60,
      color: 'emerald',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Coffee with Bea',
      due_date: inDaysAt(-1, 10),
      duration_seconds: 45 * 60,
      color: 'amber',
    },

    // The week ahead
    {
      list_name: '', category: '', type: 'event',
      title: 'Lunch with Sam',
      description: 'New ramen place near the office.',
      due_date: inDaysAt(1, 12, 30),
      duration_seconds: 60 * 60,
      color: 'amber',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Client call — Acme',
      due_date: inDaysAt(2, 11),
      duration_seconds: 45 * 60,
      color: 'sky',
    },
    {
      // Same day as the Acme call: gives the week view two blocks to stack.
      list_name: '', category: '', type: 'event',
      title: '1:1 with Priya',
      due_date: inDaysAt(2, 15),
      duration_seconds: 30 * 60,
      color: 'sky',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Dentist — check-up',
      due_date: inDaysAt(3, 14),
      duration_seconds: 30 * 60,
      color: 'emerald',
    },
    {
      list_name: '', category: '', type: 'event',
      title: "Mum's birthday",
      due_date: inDaysAt(6, 0),
      all_day: true,
      color: 'rose',
    },

    // Further out
    {
      list_name: '', category: '', type: 'event',
      title: 'Cinema with Alex',
      due_date: nextWeekdayAt(6, 19), // Saturday
      duration_seconds: 150 * 60,
      color: 'amber',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Lisbon trip',
      description: 'Long weekend with Charlie.',
      due_date: nextWeekdayAt(5, 18, 30), // Friday evening
      duration_seconds: 2 * DAY + 4 * 3600, // ~50 hours, spans the weekend
      color: 'violet',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Dinner at the Hartleys',
      due_date: inDaysAt(8, 19, 30),
      duration_seconds: 3 * 3600,
      color: 'amber',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Haircut',
      due_date: inDaysAt(9, 13),
      duration_seconds: 45 * 60,
      color: 'teal',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'School play — Ivy',
      due_date: inDaysAt(12, 18),
      duration_seconds: 2 * 3600,
      color: 'rose',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Self-assessment deadline',
      due_date: inDaysAt(15, 0),
      all_day: true,
      color: 'orange',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Vet — booster jab',
      due_date: inDaysAt(17, 16),
      duration_seconds: 30 * 60,
      color: 'emerald',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Quarterly offsite',
      description: 'Whole day, the good coffee place.',
      due_date: inDaysAt(19, 9),
      duration_seconds: 8 * 3600,
      color: 'fuchsia',
    },
    {
      list_name: '', category: '', type: 'event',
      title: 'Charlie lands — pick up',
      due_date: inDaysAt(21, 21, 45),
      duration_seconds: 60 * 60,
      color: 'violet',
    },
  ]
}

async function main() {
  guardTargetDb()
  if (!process.env.DEMO_USER_PASSWORD) {
    console.error('DEMO_USER_PASSWORD env var must be set (used only server-side, never sent to the client)')
    process.exit(1)
  }

  const { pool } = await import('../db.js')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── User + account ───────────────────────────────────────────────────
    const passwordHash = await hashPassword(process.env.DEMO_USER_PASSWORD!)
    await client.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", tier, "tierSource", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, 'pro', 'comp', NOW(), NOW())
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             email = EXCLUDED.email,
             "emailVerified" = true,
             tier = 'pro',
             "tierSource" = 'comp',
             "updatedAt" = NOW()`,
      [DEMO_USER_ID, DEMO_USER_NAME, DEMO_USER_EMAIL]
    )
    await client.query(`DELETE FROM account WHERE "userId" = $1`, [DEMO_USER_ID])
    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())`,
      [crypto.randomUUID(), DEMO_USER_EMAIL, DEMO_USER_ID, passwordHash]
    )

    // ── Wipe existing demo data so the reseed is deterministic ───────────
    await client.query(`DELETE FROM todos WHERE user_id = $1`, [DEMO_USER_ID])
    await client.query(`DELETE FROM app_settings WHERE user_id = $1`, [DEMO_USER_ID])
    await client.query(`DELETE FROM shared_lists WHERE owner_user_id = $1`, [DEMO_USER_ID])

    // ── Items ────────────────────────────────────────────────────────────
    const items = buildSeed()
    for (const it of items) {
      const isEvent = it.type === 'event'
      const listName = isEvent ? '__events__' : it.list_name
      const category = isEvent ? 'General' : it.category
      const completedAt = it.completed_at_offset_days != null
        ? new Date(Date.now() + it.completed_at_offset_days * DAY * 1000)
        : null
      await client.query(
        `INSERT INTO todos
           (user_id, list_name, title, description, category, priority, status,
            due_date, repeat_days, repeat_months, spawned_next, type, url,
            recur_until, duration_seconds, completed_at, color, all_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13, $14, $15,
                 $16, $17)`,
        [
          DEMO_USER_ID,
          listName,
          it.title,
          it.description ?? '',
          category,
          it.priority ?? 2,
          it.status ?? 0,
          it.due_date ?? null,
          it.repeat_days ?? 0,
          it.repeat_months ?? 0,
          it.type,
          isEvent ? null : (it.url ?? null),
          it.recur_until ?? null,
          isEvent ? (it.duration_seconds ?? null) : null,
          completedAt,
          isEvent ? (it.color ?? null) : null,
          isEvent ? !!it.all_day : false,
        ]
      )
    }

    // Pin the Side project board's column order. Without this the default
    // alphabetical sort opens the board on "Build", which reads as arbitrary;
    // Design → Build → Content → Launch tells a story left to right.
    await client.query(
      `INSERT INTO app_settings (user_id, key, value)
       VALUES ($1, 'category_order', $2)`,
      [
        DEMO_USER_ID,
        JSON.stringify({
          'Side project': ['Design', 'Build', 'Content', 'Launch'],
          Bookmarks: ['Daily', 'Dev', 'News', 'Watch & listen', 'Social', 'AI'],
        }),
      ]
    )

    // Land demo visitors on Home, whose Welcome note is the onboarding. List
    // tabs sort alphabetically, so without this the new Bookmarks list would
    // become tabs[0] and the fallback in listStore.fetchLists() would open
    // there instead.
    await client.query(
      `INSERT INTO app_settings (user_id, key, value)
       VALUES ($1, 'active_list', $2)`,
      [DEMO_USER_ID, JSON.stringify('Home')]
    )

    await client.query(
      `INSERT INTO app_settings (user_id, key, value)
       VALUES ($1, 'list_prefs', $2)`,
      [
        DEMO_USER_ID,
        JSON.stringify({
          Bookmarks: { layout: 'grid', columns: 3 },
        }),
      ]
    )

    // No published Discover list for the demo user: visitors can browse and
    // clone Discover content, but POST /api/shared/publish rejects demo
    // sessions (see routes/shared.ts) so they can't add their own. Seeding
    // one here would put a "Household Chores (Demo)" duplicate on the public
    // feed that no real publisher can curate or replace.

    await client.query('COMMIT')
    console.log(`✓ Demo user seeded — ${items.length} items`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
