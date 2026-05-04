import pg from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set')
  process.exit(1)
}

// Append uselibpqcompat so sslmode=require keeps its original semantics
// (encrypted but not cert-verifying), matching how libpq/the C app behaves.
const connStr = process.env.DATABASE_URL!
  .replace('sslmode=require', 'sslmode=require&uselibpqcompat=true')

export const pool = new Pool({
  connectionString: connStr,
  ssl: { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params)
}

/** Creates any tables that don't exist yet. Safe to call on every startup. */
export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

const WELCOME_NOTE_BODY =
  "You're in! Stash Squirrel keeps your todos, bookmarks, and notes together " +
  "in one tidy nest. Open the welcome tour anytime from the help button in the " +
  "header — and check off the 'Take Tour' todo when you're done exploring."

/**
 * Inserts the starter list / category / todo / note / bookmark for a fresh
 * user, plus an `onboarding` settings row whose presence signals the welcome
 * tour should run once. Run as a single transaction so a partial signup
 * never strands the user with half a Welcome category.
 */
export async function seedUserDefaults(userId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO todos
         (user_id, list_name, title, description, category, priority, status,
          due_date, repeat_days, repeat_months, spawned_next, type, url)
       VALUES
         ($1, 'Home', 'Take Tour', '', 'Welcome', 2, 0, NULL, 0, 0, 0, 'todo', NULL),
         ($1, 'Home', 'Welcome to Stash Squirrel', $2, 'Welcome', 2, 0, NULL, 0, 0, 0, 'note', NULL),
         ($1, 'Home', 'You Tube', '', 'Welcome', 2, 0, NULL, 0, 0, 0, 'bookmark', 'https://www.youtube.com')`,
      [userId, WELCOME_NOTE_BODY]
    )
    await client.query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       VALUES ($1, 'onboarding', $2::jsonb, NOW())
       ON CONFLICT (user_id, key) DO NOTHING`,
      [userId, JSON.stringify({ hasSeenWelcome: false })]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
