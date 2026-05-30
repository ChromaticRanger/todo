/**
 * Apply any pending SQL migrations from server/migrations/, tracked in schema_migrations.
 *
 * Usage:  npx tsx server/scripts/run-migrations.ts
 */

// For local runs, .env must win over any stale DATABASE_URL exported by the
// shell — that's exactly the trap the local-DB setup is meant to prevent.
// migrate:prod (ALLOW_REMOTE_DB=1) keeps the standard precedence so the value
// set by --env-file=.env.production survives. Env munging must happen BEFORE
// importing db.js (which builds its pool from process.env at module load),
// so the pool is loaded dynamically inside main().
import dotenv from 'dotenv'
if (process.env.ALLOW_REMOTE_DB !== '1') {
  delete process.env.DATABASE_URL
}
dotenv.config()

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', 'migrations')

// Safety: refuse to migrate against a non-local DB unless the caller has
// explicitly opted in. The `migrate:prod` npm script sets ALLOW_REMOTE_DB=1;
// every other invocation must hit localhost. Catches the lingering-shell-
// export trap where a stale DATABASE_URL silently routes to prod.
function guardTargetDb() {
  const url = process.env.DATABASE_URL
  if (!url) return // db.ts will error out cleanly
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return // malformed URL — let db.ts surface it
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (isLocal) {
    console.log(`→ Migrating local DB (${host})`)
    return
  }
  if (process.env.ALLOW_REMOTE_DB === '1') {
    console.log(`→ Migrating REMOTE DB (${host}) — ALLOW_REMOTE_DB is set`)
    return
  }
  console.error(
    `Refusing to migrate: DATABASE_URL points at ${host}, not localhost.\n` +
    `If this is intentional, use \`npm run migrate:prod\` (which sets ALLOW_REMOTE_DB=1).\n` +
    `If your shell still exports a stale DATABASE_URL, run \`unset DATABASE_URL\` and try again.`
  )
  process.exit(1)
}

async function main() {
  guardTargetDb()
  const { pool } = await import('../db.js')
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    // Seed historical migrations on first run. The pre-existing database had 002
    // (item_types) applied manually before this runner existed, detectable by the
    // `type` column on todos.
    const seeded = await client.query<{ count: string }>(
      'SELECT COUNT(*)::TEXT AS count FROM schema_migrations'
    )
    if (seeded.rows[0].count === '0') {
      const hasType = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'todos' AND column_name = 'type'
      `)
      if (hasType.rowCount) {
        await client.query(
          `INSERT INTO schema_migrations (name) VALUES ('002_item_types.sql')
           ON CONFLICT DO NOTHING`
        )
        console.log('Seeded historical migration: 002_item_types.sql')
      }
    }

    const files = (await fs.readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [file]
      )
      if (applied.rowCount) {
        console.log(`skip  ${file}`)
        continue
      }

      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [file]
        )
        await client.query('COMMIT')
        console.log(`apply ${file}`)
      } catch (err) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${err}`)
      }
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
