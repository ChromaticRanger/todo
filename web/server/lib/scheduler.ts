import { runDailyDigests, digestConfig } from './digest.js'
import { cleanupDemoUsers } from './demoCleanup.js'

/**
 * In-process hourly scheduler.
 *
 * Replaces the GitHub Actions cron that used to drive the digest. That
 * schedule asked for 24 runs a day and delivered about 23% of them, with gaps
 * reaching nearly 8 hours — GitHub's scheduled runs on shared runners are
 * best-effort. The digest only sends to users whose local time is inside the
 * send window, so dropped runs meant whole timezones silently got nothing that
 * day. It was also subject to being disabled outright after 60 days of repo
 * inactivity, which is a poor dependency for a user-facing email.
 *
 * Both jobs here are safe to run more than once, which is what makes an
 * in-process timer viable:
 *
 *   - the digest dedupes per user per local day via digest_log, so a second
 *     instance (or a restart mid-hour) can't double-send;
 *   - the demo cleanup is an idempotent DELETE.
 *
 * So no leader election is needed if the app ever scales past one instance.
 *
 * The tradeoff versus an external cron is that a restart or redeploy can miss
 * an hour. The digest's multi-hour catch-up window absorbs that, and the
 * kick-off run below means a restart re-checks immediately rather than waiting
 * for the next tick.
 *
 * POST /api/cron/daily-digest stays mounted for manual runs and as a backstop.
 */

const HOUR_MS = 60 * 60 * 1000

/** Let the app finish booting before the first pass. */
const KICKOFF_DELAY_MS = 30_000

/** The demo sweep is cheap but pointless hourly; once a day is plenty. */
const CLEANUP_EVERY_MS = 24 * HOUR_MS

let timers: ReturnType<typeof setInterval>[] = []
let started = false

/**
 * Guards against a slow pass overlapping the next tick. Not a distributed
 * lock — it only protects this process, which is all that's needed given both
 * jobs are idempotent.
 */
function once(name: string, fn: () => Promise<unknown>): () => void {
  let running = false
  return () => {
    if (running) {
      console.warn(`[scheduler] ${name} still running, skipping this tick`)
      return
    }
    running = true
    void fn()
      .then((summary) => {
        console.log(`[scheduler] ${name}:`, summary)
      })
      .catch((err) => {
        // Never let a failed job take the process down; the next tick retries.
        console.error(`[scheduler] ${name} failed:`, err)
      })
      .finally(() => {
        running = false
      })
  }
}

const runDigest = once('daily digest', () => runDailyDigests())
const runCleanup = once('demo cleanup', () => cleanupDemoUsers())

export function startScheduler(): void {
  if (started) return

  // An explicit off switch, so a one-off container (a migration task, a shell
  // on the droplet) can run the same image without also sending email.
  if (process.env.DISABLE_SCHEDULER === '1') {
    console.log('[scheduler] disabled by DISABLE_SCHEDULER=1')
    return
  }

  // Off by default outside production: a developer running the server locally
  // should never mail real users. ENABLE_SCHEDULER=1 opts in for testing.
  const isProd = process.env.NODE_ENV === 'production'
  if (!isProd && process.env.ENABLE_SCHEDULER !== '1') {
    console.log('[scheduler] idle outside production (set ENABLE_SCHEDULER=1 to run)')
    return
  }

  started = true

  const cfg = digestConfig()
  console.log(
    `[scheduler] hourly digest — send hour ${cfg.sendHour}, ` +
      `window ${cfg.windowHours}h (local ${cfg.sendHour}:00-${cfg.sendHour + cfg.windowHours - 1}:59); ` +
      `demo cleanup every ${CLEANUP_EVERY_MS / HOUR_MS}h`
  )

  // Catch up straight after a restart rather than waiting a full hour — a
  // redeploy during someone's send window would otherwise cost them the day.
  const kickoff = setTimeout(() => {
    runDigest()
    runCleanup()
  }, KICKOFF_DELAY_MS)
  kickoff.unref()

  const digestTimer = setInterval(runDigest, HOUR_MS)
  const cleanupTimer = setInterval(runCleanup, CLEANUP_EVERY_MS)
  // The HTTP server keeps the process alive; these shouldn't hold it open on
  // their own, so a script importing this module can still exit.
  digestTimer.unref()
  cleanupTimer.unref()
  timers = [digestTimer, cleanupTimer]
}

export function stopScheduler(): void {
  for (const t of timers) clearInterval(t)
  timers = []
  started = false
}
