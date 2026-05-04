import { query, pool } from '../server/db.ts'

const email = process.argv[2]
if (!email) {
  console.error('Usage: tsx scripts/clear-stale-stripe-for-user.mts <email>')
  process.exit(1)
}

const u = await query<{ id: string; stripeCustomerId: string | null }>(
  `SELECT id, "stripeCustomerId" FROM "user" WHERE email = $1`,
  [email]
)
if (u.rows.length === 0) {
  console.error(`No user found with email ${email}`)
  process.exit(1)
}
const { id, stripeCustomerId } = u.rows[0]
console.log(`User: ${email}  id=${id}  stripeCustomerId=${stripeCustomerId}`)

// Only delete subscription rows that never completed (status='incomplete' or
// no Stripe subscription ID). Avoid touching anything that represents a real
// active/past billing relationship.
const subDelete = await query(
  `DELETE FROM subscription
     WHERE "referenceId" = $1
       AND (status = 'incomplete' OR "stripeSubscriptionId" IS NULL)
   RETURNING id, status, "stripeSubscriptionId"`,
  [id]
)
console.log(`Deleted ${subDelete.rowCount} incomplete subscription row(s):`)
for (const r of subDelete.rows) console.log('  -', r)

const userUpdate = await query(
  `UPDATE "user" SET "stripeCustomerId" = NULL WHERE id = $1`,
  [id]
)
console.log(`Cleared stripeCustomerId on user: ${userUpdate.rowCount} row(s)`)

await pool.end()
