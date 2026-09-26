import { readFile } from 'node:fs/promises'
import { check, heading } from './harness.js'

/**
 * Middleware order in index.ts, asserted by reading the file.
 *
 * Unusual, but these are the failures that no runtime test catches and that all
 * look like something else in production: the invite preview quietly starts
 * 401ing for exactly the people who don't have accounts yet, and the event
 * stream starts 429ing a user's whole app after one bad deploy. Both are one
 * carelessly moved `app.use` away, and both are invisible locally.
 */
export default async function run(): Promise<void> {
  const src = await readFile(new URL('../index.ts', import.meta.url), 'utf8')
  const at = (needle: string): number => src.indexOf(needle)

  const authMiddleware = at("app.use('/api', authMiddleware)")
  const requirePlan = at("app.use('/api', requirePlan)")
  const rateLimit = at("app.use('/api', rateLimit)")
  const preview = at("app.use('/api/collab/invites/preview'")
  const eventStream = at("app.use('/api/events'")

  heading('index.ts middleware order')

  check('all five mounts are present', [authMiddleware, requirePlan, rateLimit, preview, eventStream].every((i) => i > -1))

  check(
    'the invite preview mounts before authMiddleware',
    preview > -1 && preview < authMiddleware,
    'otherwise someone without an account gets a 401 on their own invite'
  )
  check(
    'the event stream mounts after authMiddleware',
    eventStream > authMiddleware,
    'the stream is per-user and must know who is asking'
  )
  check(
    'the event stream mounts before requirePlan',
    eventStream < requirePlan,
    'a user who has not picked a plan should not get 402 on a stream'
  )
  check(
    'the event stream mounts before rateLimit',
    eventStream < rateLimit,
    'EventSource retries forever; under the 60/min limiter that 429s the whole app'
  )
}
