/**
 * Apply any pending SQL migrations from server/migrations/, tracked in schema_migrations.
 *
 * Usage:  npx tsx server/scripts/run-migrations.ts
 */

import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', 'migrations')

async function main() {
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
