import { readFile } from 'node:fs/promises'
import { check, heading } from './harness.js'

/**
 * Mount order and public exposure in index.ts, asserted by reading the file.
 *
 * Unusual, but these are the failures that no runtime test catches and that all
 * look like something else in production: the invite preview quietly starts
 * 401ing for exactly the people who don't have accounts yet, and the event
 * stream starts 429ing a user's whole app after one bad deploy. Both are one
 * carelessly moved `app.use` away, and both are invisible locally.
 *
 * The exposure check is here because /api/health mounts before authMiddleware
 * and is therefore world-readable. It once returned live connection counts,
 * which meant anyone could sample our concurrent usage from outside. Nothing
 * about that looks wrong in a passing test suite, so it gets asserted.
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

  heading('public exposure')

  const health = src.slice(at("app.get('/api/health'"), at("app.use('/api/demo'"))
  check(
    '/api/health mounts before authMiddleware, so it is world-readable',
    at("app.get('/api/health'") < authMiddleware
  )
  check(
    '/api/health leaks no connection counts to the public',
    !health.includes('connectionStats'),
    'how many people are connected is commercial information — admin gate only'
  )
  check(
    '/api/health still reports listener health, which monitoring needs',
    health.includes('isRealtimeHealthy'),
    'a dead listener is the one silent failure worth alerting on'
  )

  const admin = await readFile(new URL('../routes/admin.ts', import.meta.url), 'utf8')
  check(
    'the connection counts live behind the admin gate instead',
    admin.includes('connectionStats') &&
      admin.indexOf('router.use(requireAdmin)') < admin.indexOf("router.get('/realtime'")
  )
}
