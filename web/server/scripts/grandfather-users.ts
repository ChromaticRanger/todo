/**
 * Idempotent: mark every existing user (tier IS NULL) as 'pro'.
 * Grandfathers users who signed up before billing existed — they get Pro
 * entitlement without a Stripe subscription or customer record.
 *
 * Usage:  npx tsx server/scripts/grandfather-users.ts
 */

import 'dotenv/config'
import { pool } from '../db.js'

async function main() {
  try {
    const { rows } = await pool.query<{ id: string; email: string }>(
      'SELECT id, email FROM "user" WHERE tier IS NULL ORDER BY "createdAt"'
    )

    if (rows.length === 0) {
      console.log('No users with tier=NULL. Nothing to do.')
      return
    }

    console.log(`Found ${rows.length} user(s) to grandfather to Pro:`)
    for (const u of rows) console.log(`  - ${u.email} (${u.id})`)

    const result = await pool.query(
      `UPDATE "user" SET tier = 'pro' WHERE tier IS NULL`
    )
    console.log(`Updated ${result.rowCount} row(s) → tier='pro'.`)
  } catch (err) {
    console.error('grandfather-users failed:', err)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
