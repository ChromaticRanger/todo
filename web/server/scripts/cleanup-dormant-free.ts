/**
 * Delete Free-tier users who have never created any todo and whose account
 * is older than 180 days. Relies on the FK cascade from "user"(id) to
 * todos.user_id / app_settings.user_id (added in 003_multi_tenant.sql) so
 * dependent rows are removed automatically.
 *
 * Usage:  npx tsx server/scripts/cleanup-dormant-free.ts
 */

import 'dotenv/config'
import { pool } from '../db.js'

const DORMANCY_DAYS = 180

async function main() {
  try {
    const { rows } = await pool.query<{ id: string; email: string }>(
      `SELECT id, email FROM "user"
         WHERE tier = 'free'
           AND "createdAt" < NOW() - $1::INTERVAL
           AND NOT EXISTS (
             SELECT 1 FROM todos WHERE todos.user_id = "user".id
           )`,
      [`${DORMANCY_DAYS} days`]
    )

    if (rows.length === 0) {
      console.log(`No dormant free users older than ${DORMANCY_DAYS} days.`)
      return
    }

    console.log(`Deleting ${rows.length} dormant free user(s):`)
    for (const u of rows) console.log(`  - ${u.email} (${u.id})`)

    const result = await pool.query(
      `DELETE FROM "user"
         WHERE tier = 'free'
           AND "createdAt" < NOW() - $1::INTERVAL
           AND NOT EXISTS (
             SELECT 1 FROM todos WHERE todos.user_id = "user".id
           )`,
      [`${DORMANCY_DAYS} days`]
    )
    console.log(`Deleted ${result.rowCount} user row(s).`)
  } catch (err) {
    console.error('cleanup-dormant-free failed:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
