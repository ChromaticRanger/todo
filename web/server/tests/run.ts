import { pool } from '../db.js'
import { suiteResult } from './harness.js'
import mountOrder from './mountOrder.test.js'
import invites from './invites.test.js'
import realtime from './realtime.test.js'
import eventsRoute from './eventsRoute.test.js'
import discover from './discover.test.js'

/**
 * Runs the shared-lists suites against the LOCAL database.
 *
 *   npm run db:up && npm run db:migrate
 *   npm run test:collab
 *
 * Suites run in sequence, not in parallel: several of them subscribe to the same
 * Postgres NOTIFY channel and would see each other's events.
 *
 * Each suite cleans up its own fixtures in a `finally`, keyed on a unique id
 * prefix, so a crashed run leaves at most one generation of `test-*` users
 * behind rather than colliding with the next one.
 */

const SUITES: [string, () => Promise<void>][] = [
  ['mount order', mountOrder],
  ['invites', invites],
  ['realtime', realtime],
  ['events route', eventsRoute],
  ['discover moderation & likes', discover],
]

const host = new URL(process.env.DATABASE_URL ?? 'postgres://localhost').hostname
if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
  console.error(`Refusing to run: DATABASE_URL points at ${host}, not a local database.`)
  console.error('These suites create and delete rows. Never point them at production.')
  process.exit(1)
}

let failed = false
for (const [name, suite] of SUITES) {
  console.log(`\n${'─'.repeat(60)}\n${name}`)
  try {
    await suite()
  } catch (err) {
    console.error(`  ERROR in ${name}:`, err)
    failed = true
  }
}

const { checks, failures } = suiteResult()
console.log(`\n${'─'.repeat(60)}`)
console.log(`${checks} checks, ${failures} failed`)
await pool.end()
process.exit(failed || failures > 0 ? 1 : 0)
