/**
 * One-shot cleanup: delete the "Household Chores (Demo)" published Discover
 * list that an earlier version of seed-demo.ts created under the demo-user
 * template. Since demo visitors are now blocked from publishing to Discover
 * (POST /api/shared/publish 403s for `demo-` users), the seeded list is
 * leftover and just clutters the public feed.
 *
 * shared_items cascade-deletes via shared_items_shared_list_id_fkey.
 *
 * Usage:
 *   npm run discover:remove-demo-list      (local DB)
 *   npm run discover:remove-demo-list:prod (production, sets ALLOW_REMOTE_DB=1)
 *
 * Safe to delete this file after the one-time cleanup has been run on prod.
 */

import dotenv from 'dotenv'
if (process.env.ALLOW_REMOTE_DB !== '1') {
  delete process.env.DATABASE_URL
}
dotenv.config()

const DEMO_USER_ID = 'demo-user'
const SLUG = 'demo-household-chores'

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
    console.log(`→ Cleaning local DB (${host})`)
    return
  }
  if (process.env.ALLOW_REMOTE_DB === '1') {
    console.log(`→ Cleaning REMOTE DB (${host}) — ALLOW_REMOTE_DB is set`)
    return
  }
  console.error(`Refusing to clean: DATABASE_URL points at ${host}, not localhost.`)
  process.exit(1)
}

async function main() {
  guardTargetDb()
  const { pool } = await import('../db.js')
  const client = await pool.connect()
  try {
    const result = await client.query<{ id: number; slug: string }>(
      `DELETE FROM shared_lists
        WHERE slug = $1 AND owner_user_id = $2
        RETURNING id, slug`,
      [SLUG, DEMO_USER_ID]
    )
    if ((result.rowCount ?? 0) === 0) {
      console.log(`✓ Nothing to delete — no shared_list with slug='${SLUG}' owned by ${DEMO_USER_ID}.`)
    } else {
      console.log(`✓ Deleted ${result.rowCount} shared_list row(s); shared_items cascaded.`)
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
