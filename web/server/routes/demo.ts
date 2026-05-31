/**
 * Demo-account entry/exit endpoints.
 *
 * Each visitor gets their own ephemeral demo user cloned from the seeded
 * `demo-user` template. Their writes persist in their own namespace — so the
 * calendar refetches see new events, time-windowed views update, and Discover
 * clones work — but the data is throwaway: a cleanup script (`npm run
 * cleanup:demo`) periodically removes ephemerals older than 24h.
 *
 * - POST /api/demo/start  — clones todos + app_settings from `demo-user` into
 *                          a fresh `demo-<uuid>` user, signs that user in,
 *                          and sets the session cookie on the response.
 * - POST /api/demo/end    — signs out. Used by the end-of-demo modal before
 *                          navigating away so the next page is unauth'd.
 *
 * The seeded template lives in the same tables as any real user. To prevent
 * anyone accidentally signing in as the template and polluting the seed, the
 * `demoNoop` middleware no-ops writes from id === 'demo-user' specifically.
 * Ephemeral users (demo-<uuid>) are normal Pro users from the server's
 * perspective.
 */
import express from 'express'
import crypto from 'node:crypto'
import { rateLimit as rateLimiter, ipKeyGenerator } from 'express-rate-limit'
import { fromNodeHeaders } from 'better-auth/node'
import { hashPassword } from 'better-auth/crypto'
import { auth } from '../auth.js'
import { query } from '../db.js'

const router = express.Router()

const TEMPLATE_USER_ID = 'demo-user'

// Per-IP rate limit for /start. A human starting a demo a couple of times
// per minute is generous; bot loops minting accounts get blocked.
const startLimit = rateLimiter({
  windowMs: 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? ''),
  message: { error: 'rate_limited' },
})

router.post('/start', startLimit, async (req, res) => {
  try {
    // 0. Lazy cleanup: delete ephemeral demo users older than the demo
    //    ceiling (30 min) plus headroom. Skips demos that are referenced
    //    by a pending_demo_carryover row — those are parked waiting for a
    //    signed-up user to pick their plan (Pro transfers, Free discards).
    await query(
      `DELETE FROM "user"
        WHERE id LIKE 'demo-%'
          AND id <> $1
          AND "createdAt" < NOW() - INTERVAL '1 hour'
          AND id NOT IN (
            SELECT value->>'demoUserId' FROM app_settings
             WHERE key = 'pending_demo_carryover'
          )`,
      [TEMPLATE_USER_ID]
    )

    // 1. Mint an ephemeral user id + a throwaway password. The password
    //    never leaves the server — we use it once below to log this user in.
    const newUserId = `demo-${crypto.randomUUID()}`
    const newEmail = `${newUserId}@demo.stash-squirrel.local`
    const password = crypto.randomBytes(24).toString('hex')
    const passwordHash = await hashPassword(password)

    // 2. Create the user + credential row. tier='pro' so they see all
    //    features; tierSource='comp' so they can't accidentally be billed.
    await query(
      `INSERT INTO "user" (id, name, email, "emailVerified", tier, "tierSource", "createdAt", "updatedAt")
       VALUES ($1, 'Demo', $2, true, 'pro', 'comp', NOW(), NOW())`,
      [newUserId, newEmail]
    )
    await query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $4, NOW(), NOW())`,
      [crypto.randomUUID(), newEmail, newUserId, passwordHash]
    )

    // 3. Clone the seed content from the template. Each visitor starts on a
    //    pristine copy; their writes mutate this copy, not the template.
    await query(
      `INSERT INTO todos
         (user_id, list_name, title, description, category, priority, status,
          due_date, repeat_days, repeat_months, spawned_next, type, url,
          recur_until, duration_seconds, completed_at, snoozed_until)
       SELECT $1, list_name, title, description, category, priority, status,
              due_date, repeat_days, repeat_months, spawned_next, type, url,
              recur_until, duration_seconds, completed_at, snoozed_until
         FROM todos
        WHERE user_id = $2`,
      [newUserId, TEMPLATE_USER_ID]
    )
    await query(
      `INSERT INTO app_settings (user_id, key, value, updated_at)
       SELECT $1, key, value, updated_at FROM app_settings WHERE user_id = $2`,
      [newUserId, TEMPLATE_USER_ID]
    )

    // 4. Sign the ephemeral user in via Better Auth's email/password flow.
    //    asResponse:true returns a Fetch Response whose Set-Cookie headers
    //    we forward to Express so the browser stores the session cookie.
    const result = await auth.api.signInEmail({
      body: { email: newEmail, password },
      asResponse: true,
    })
    if (!result.ok) {
      console.error('[demo] sign-in failed:', result.status, await result.text())
      return res.status(500).json({ error: 'demo_signin_failed' })
    }
    const setCookie = result.headers.getSetCookie?.() ?? []
    if (setCookie.length === 0) {
      const single = result.headers.get('set-cookie')
      if (single) setCookie.push(single)
    }
    for (const c of setCookie) res.append('Set-Cookie', c)
    res.status(204).end()
  } catch (err) {
    console.error('[demo] /start error:', err)
    res.status(500).json({ error: 'demo_signin_failed' })
  }
})

/**
 * Convert a demo session into a real account. The visitor's currently
 * authenticated demo session (`demo-<uuid>`) is consumed atomically with
 * the signup. If `keepData=true`, todos / app_settings / shared_lists rows
 * owned by the demo user are reassigned to the new account before the demo
 * user is deleted; if false, the demo user (and all its data) is simply
 * deleted and the new account starts clean.
 *
 * Returns the underlying Better Auth signUpEmail response verbatim so the
 * frontend can drive the standard post-signup UI (sign-in or
 * "check your inbox", depending on REQUIRE_EMAIL_VERIFICATION).
 */
router.post('/promote-signup', async (req, res) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    const demoUserId = session?.user?.id
    // Only ephemeral demo users may promote. The `demo-user` template is
    // off-limits even if someone manages to sign in as it.
    if (!demoUserId || !demoUserId.startsWith('demo-') || demoUserId === 'demo-user') {
      return res.status(401).json({ error: 'not_a_demo_session' })
    }

    const { email, password, name } = req.body as {
      email?: string
      password?: string
      name?: string
    }
    if (!email || !password) {
      return res.status(400).json({ error: 'missing_fields' })
    }

    // Reject duplicate emails up front. Better Auth's signUpEmail returns a
    // 200 with a fabricated user object when the email already exists, which
    // would silently merge keepData=true demo content into the existing
    // account if we trusted that response.
    const existing = await query<{ id: string }>(
      `SELECT id FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    )
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'email_in_use', message: 'An account with this email already exists. Sign in instead.' })
    }

    // Run the signup via Better Auth so password hashing, verification email,
    // and any plugins (Stripe customer create-on-signup) all fire normally.
    const signUpResult = await auth.api.signUpEmail({
      body: { email, password, name: name || email.split('@')[0] },
      asResponse: true,
    })
    if (!signUpResult.ok) {
      const text = await signUpResult.text()
      console.error('[demo] promote signup failed:', signUpResult.status, text)
      res.status(signUpResult.status)
      const ct = signUpResult.headers.get('content-type')
      if (ct) res.type(ct)
      return res.send(text)
    }

    const { rows } = await query<{ id: string }>(
      `SELECT id FROM "user" WHERE email = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [email]
    )
    const newUserId = rows[0]?.id
    if (!newUserId) {
      console.error('[demo] could not locate newly-created user by email')
      return res.status(500).json({ error: 'promote_failed' })
    }

    // Park the demo work for later. The transfer doesn't happen yet — the
    // visitor's plan choice on ChoosePlan decides: picking Pro moves the
    // data over; picking Free discards it. Storing the demoUserId on the
    // new user lets either path resolve it. Demo user stays alive (the
    // cleanup script skips parked demos).
    await query(
      `INSERT INTO app_settings (user_id, key, value)
       VALUES ($1, 'pending_demo_carryover', $2::jsonb)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [newUserId, JSON.stringify({ demoUserId })]
    )

    // Forward Better Auth's response — its Set-Cookie either signs the new
    // user in immediately (verification disabled) or leaves the response
    // unauthenticated for the "check your inbox" UI to take over.
    const setCookie = signUpResult.headers.getSetCookie?.() ?? []
    if (setCookie.length === 0) {
      const single = signUpResult.headers.get('set-cookie')
      if (single) setCookie.push(single)
    }
    for (const c of setCookie) res.append('Set-Cookie', c)
    res.status(signUpResult.status)
    const ct = signUpResult.headers.get('content-type')
    if (ct) res.type(ct)
    const body = await signUpResult.text()
    res.send(body)
  } catch (err) {
    // Log the full stack so it actually shows in the dev console; the
    // generic 'promote_failed' the client receives hides the real cause.
    console.error('[demo] /promote-signup error:', err instanceof Error ? err.stack : err)
    res.status(500).json({ error: 'promote_failed', detail: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/end', async (req, res) => {
  try {
    const result = await auth.api.signOut({
      headers: fromNodeHeaders(req.headers),
      asResponse: true,
    })
    const setCookie = result.headers.getSetCookie?.() ?? []
    if (setCookie.length === 0) {
      const single = result.headers.get('set-cookie')
      if (single) setCookie.push(single)
    }
    for (const c of setCookie) res.append('Set-Cookie', c)
    res.status(204).end()
  } catch (err) {
    console.error('[demo] /end error:', err)
    res.status(500).json({ error: 'demo_signout_failed' })
  }
})

export default router
