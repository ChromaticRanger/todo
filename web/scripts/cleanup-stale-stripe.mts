import 'dotenv/config'
import Stripe from 'stripe'
import { query, pool } from '../server/db.ts'

const apply = process.argv.includes('--apply')
const onlyEmail = process.argv.find((a) => a.startsWith('--email='))?.split('=')[1]

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY not set')
  process.exit(1)
}
const stripe = new Stripe(key)

console.log(`Mode: ${apply ? 'APPLY (will modify DB)' : 'DRY RUN (no changes)'}`)
console.log(`Stripe key prefix: ${key.slice(0, 8)}...  (sk_live_* = live, sk_test_* = test)`)

const users = await query<{ id: string; email: string; stripeCustomerId: string }>(
  `SELECT id, email, "stripeCustomerId"
     FROM "user"
    WHERE "stripeCustomerId" IS NOT NULL
      ${onlyEmail ? 'AND email = $1' : ''}
    ORDER BY email`,
  onlyEmail ? [onlyEmail] : []
)

if (users.rows.length === 0) {
  console.log('No users with a stored stripeCustomerId.')
  await pool.end()
  process.exit(0)
}

console.log(`\nChecking ${users.rows.length} user(s) against Stripe...\n`)

const stale: { id: string; email: string; cid: string }[] = []
for (const u of users.rows) {
  process.stdout.write(`  ${u.email.padEnd(40)} ${u.stripeCustomerId} ... `)
  try {
    const cust = await stripe.customers.retrieve(u.stripeCustomerId)
    if ((cust as { deleted?: boolean }).deleted) {
      console.log('DELETED in Stripe')
      stale.push({ id: u.id, email: u.email, cid: u.stripeCustomerId })
    } else {
      console.log('ok')
    }
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string }
    if (e.code === 'resource_missing') {
      console.log('MISSING in Stripe')
      stale.push({ id: u.id, email: u.email, cid: u.stripeCustomerId })
    } else {
      console.log(`error: ${e.message ?? String(err)}`)
    }
  }
}

if (stale.length === 0) {
  console.log('\nAll customer IDs are valid in the current Stripe environment.')
  await pool.end()
  process.exit(0)
}

console.log(`\nFound ${stale.length} user(s) with stale stripeCustomerId:`)
for (const s of stale) console.log(`  ${s.email}  (${s.cid})`)

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to clear these and any incomplete subscription rows.')
  await pool.end()
  process.exit(0)
}

console.log('\nApplying cleanup...')
const ids = stale.map((s) => s.id)
const subDelete = await query(
  `DELETE FROM subscription
     WHERE "referenceId" = ANY($1::text[])
       AND (status = 'incomplete' OR "stripeSubscriptionId" IS NULL)
   RETURNING id, "referenceId", status`,
  [ids]
)
console.log(`  subscription rows deleted: ${subDelete.rowCount}`)
for (const r of subDelete.rows) console.log(`    -`, r)

const userUpdate = await query(
  `UPDATE "user" SET "stripeCustomerId" = NULL WHERE id = ANY($1::text[])`,
  [ids]
)
console.log(`  user.stripeCustomerId cleared on: ${userUpdate.rowCount}`)

console.log('\nDone.')
await pool.end()
