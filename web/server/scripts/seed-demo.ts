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
}

function buildSeed(): SeedTodo[] {
  return [
    // ── Home ──────────────────────────────────────────────────────────────
    {
      list_name: 'Home', category: 'Welcome', type: 'note',
      title: 'Welcome to the Stash Squirrel demo',
      description:
        "This is a fully interactive demo account. Click around, drag, edit, " +
        "complete, create — everything works the same as the real app, and " +
        "your changes stick around through page refreshes too.\n\n" +
        "You have 30 minutes. When the timer in the banner runs out (or any " +
        "time before) you can sign up — tick \"Keep my demo work\" on the " +
        "signup form and everything you built here moves into your new " +
        "account. Untick it to start with a clean slate instead. Either way " +
        "the demo account itself gets cleaned up afterwards.",
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

    // ── Events (live on the calendar) ──────────────────────────────────────
    // Weekly recurring standup, Mon-Fri 9:30-9:45
    {
      list_name: '', category: '', type: 'event',
      title: 'Team standup',
      due_date: nextWeekdayAt(1, 9, 30), // next Monday
      duration_seconds: 15 * 60,
      repeat_days: 7,
    },
    // One-off coffee in the past, shows past styling
    {
      list_name: '', category: '', type: 'event',
      title: 'Coffee with Bea',
      due_date: inDaysAt(-1, 10),
      duration_seconds: 45 * 60,
    },
    // Lunch tomorrow
    {
      list_name: '', category: '', type: 'event',
      title: 'Lunch with Sam',
      description: 'New ramen place near the office.',
      due_date: inDaysAt(1, 12, 30),
      duration_seconds: 60 * 60,
    },
    // Dentist mid-week
    {
      list_name: '', category: '', type: 'event',
      title: 'Dentist — check-up',
      due_date: inDaysAt(3, 14),
      duration_seconds: 30 * 60,
    },
    // Cinema this Saturday
    {
      list_name: '', category: '', type: 'event',
      title: 'Cinema with Alex',
      due_date: nextWeekdayAt(6, 19), // Saturday
      duration_seconds: 150 * 60,
    },
    // Multi-day Lisbon trip — Friday evening to Sunday evening
    {
      list_name: '', category: '', type: 'event',
      title: 'Lisbon trip',
      description: 'Long weekend with Charlie.',
      due_date: nextWeekdayAt(5, 18, 30), // Friday evening
      duration_seconds: 2 * DAY + 4 * 3600, // ~50 hours
    },
    // Monthly review
    {
      list_name: '', category: '', type: 'event',
      title: 'Monthly review & planning',
      due_date: inDaysAt(10, 14),
      duration_seconds: 2 * 3600,
      repeat_months: 1,
    },
    // Birthday next week
    {
      list_name: '', category: '', type: 'event',
      title: "Mum's birthday",
      due_date: inDaysAt(6, 9),
      duration_seconds: 0, // all-day-ish; rendered as 30-min visual block
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
            recur_until, duration_seconds, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12, $13, $14, $15)`,
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
        ]
      )
    }

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
