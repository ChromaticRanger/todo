import 'dotenv/config'
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import Stripe from 'stripe'
import { stripe as stripePlugin } from '@better-auth/stripe'
import { pool, query, seedUserDefaults } from './db.js'
import {
  sendVerificationEmailFor,
  sendPasswordResetEmailFor,
  sendWelcomeEmailFor,
} from './lib/email.js'

const {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_PRO_MONTHLY,
  STRIPE_PRICE_PRO_YEARLY,
  REQUIRE_EMAIL_VERIFICATION,
} = process.env

if (!BETTER_AUTH_SECRET) {
  console.error('BETTER_AUTH_SECRET environment variable is not set')
  process.exit(1)
}

type SocialProviders = NonNullable<Parameters<typeof betterAuth>[0]['socialProviders']>
const socialProviders: SocialProviders = {}

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
  }
}

if (GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
  }
}

const stripeEnabled = !!(
  STRIPE_SECRET_KEY &&
  STRIPE_WEBHOOK_SECRET &&
  STRIPE_PRICE_PRO_MONTHLY
)

if (!stripeEnabled) {
  console.warn(
    '[auth] Stripe env vars missing — Stripe plugin disabled. Pro upgrades will not work until STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRICE_PRO_MONTHLY are set.'
  )
}

const stripeClient = stripeEnabled ? new Stripe(STRIPE_SECRET_KEY!) : null

// Exposed so account-deletion can cancel subscriptions directly via the SDK.
// null when Stripe env vars are unset (dev without billing).
export const stripe = stripeClient

/**
 * databaseHooks.account.create.after — runs when Better Auth creates an
 * account row. For OAuth-based accounts only, this parks the visitor's
 * demo data so their plan choice on ChoosePlan can decide: picking Pro
 * transfers it, picking Free discards it. We don't move anything here —
 * just record the demo user reference on the new user.
 *
 * The incoming request still has the visitor's demo session cookie attached
 * (the new social-auth session cookie isn't set until after this hook
 * returns), so getSession resolves to the demo user.
 */
// Hoisted function so the closure over `auth` resolves at runtime, not at
// the point where it's wired into the betterAuth config below.
// Outer try/catch: a thrown error inside this hook would abort the whole
// signup transaction, leaving the visitor with "Sign up failed" and a 500.
/**
 * Move parked demo data into the new user's account. Called from
 * onSubscriptionComplete when a fresh signup upgrades to Pro. Idempotent:
 * if there's no pending row, or the referenced demo user has already been
 * cleaned up, the function is a no-op.
 */
export async function finalizeProCarryover(userId: string): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pending = await client.query<{ value: { demoUserId?: string } }>(
      `SELECT value FROM app_settings
        WHERE user_id = $1 AND key = 'pending_demo_carryover'`,
      [userId]
    )
    const demoUserId = pending.rows[0]?.value?.demoUserId
    if (!demoUserId || !demoUserId.startsWith('demo-') || demoUserId === 'demo-user') {
      await client.query(
        `DELETE FROM app_settings WHERE user_id = $1 AND key = 'pending_demo_carryover'`,
        [userId]
      )
      await client.query('COMMIT')
      return
    }
    const demoExists = await client.query<{ id: string }>(
      `SELECT id FROM "user" WHERE id = $1`,
      [demoUserId]
    )
    if ((demoExists.rowCount ?? 0) === 0) {
      // Cleanup script must have already removed the demo user. Nothing to
      // transfer; just clear the now-orphaned pointer.
      await client.query(
        `DELETE FROM app_settings WHERE user_id = $1 AND key = 'pending_demo_carryover'`,
        [userId]
      )
      await client.query('COMMIT')
      return
    }
    // Wipe the welcome seed seedUserDefaults wrote at signup, then transfer.
    // The pending row itself is preserved by the key-skip so we don't lose
    // the pointer mid-transaction; it gets dropped at the end.
    await client.query(`DELETE FROM todos WHERE user_id = $1`, [userId])
    await client.query(
      `DELETE FROM app_settings WHERE user_id = $1 AND key <> 'pending_demo_carryover'`,
      [userId]
    )
    await client.query(`UPDATE todos SET user_id = $1 WHERE user_id = $2`, [userId, demoUserId])
    await client.query(`UPDATE app_settings SET user_id = $1 WHERE user_id = $2`, [userId, demoUserId])
    await client.query(`UPDATE shared_lists SET owner_user_id = $1 WHERE owner_user_id = $2`, [userId, demoUserId])
    await client.query(`DELETE FROM "user" WHERE id = $1`, [demoUserId])
    await client.query(
      `DELETE FROM app_settings WHERE user_id = $1 AND key = 'pending_demo_carryover'`,
      [userId]
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

async function promoteDemoOnOAuth(
  account: unknown,
  ctx: unknown
): Promise<void> {
  try {
    const a = account as { providerId?: string; userId?: string } | null
    if (!a || typeof a.providerId !== 'string' || typeof a.userId !== 'string') return
    // Email/password flows go through /api/demo/promote-signup which records
    // the parked-carryover row itself; skip those here to avoid double-work.
    if (a.providerId === 'credential') return
    const headers = (ctx as { headers?: Headers } | null | undefined)?.headers
    if (!headers || typeof headers.get !== 'function') return
    const session = await auth.api.getSession({ headers })
    const demoUserId = session?.user?.id
    if (!demoUserId || !demoUserId.startsWith('demo-') || demoUserId === 'demo-user') return
    if (demoUserId === a.userId) return
    await query(
      `INSERT INTO app_settings (user_id, key, value)
       VALUES ($1, 'pending_demo_carryover', $2::jsonb)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [a.userId, JSON.stringify({ demoUserId })]
    )
  } catch (err) {
    // Never fail signup on parking errors — the visitor still gets a working
    // real account; they just won't see the carryover option on ChoosePlan.
    console.error('[auth] OAuth demo carryover park failed:', err)
  }
}

export const auth = betterAuth({
  appName: 'Stash Squirrel',
  database: pool,
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: REQUIRE_EMAIL_VERIFICATION === 'true',
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendPasswordResetEmailFor(user, url)
    },
  },
  emailVerification: {
    // Send the verification email the moment the account is created, so the
    // "check your inbox" prompt shown after sign-up is truthful. Without this
    // the email only goes out on the first (blocked) sign-in attempt.
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmailFor(user, url)
    },
    autoSignInAfterVerification: true,
  },
  user: {
    additionalFields: {
      tier: {
        type: 'string',
        required: false,
        defaultValue: null,
        input: false,
      },
      // 'stripe' for tiers granted via Stripe webhook, 'comp' for admin-granted
      // PRO accounts. Lets us tell paying users apart from comped friends and
      // avoid surprises when Stripe events fire for users who never paid.
      tierSource: {
        type: 'string',
        required: false,
        defaultValue: null,
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await seedUserDefaults(user.id)
          } catch (err) {
            // Don't fail signup if seeding fails — user can still use the app.
            console.error('[auth] seedUserDefaults failed for', user.id, err)
          }
          // The welcome email is sent at plan-selection time (free → /api/plan/
          // select-free, pro → onSubscriptionComplete) so it can reflect the
          // chosen tier — the tier is still null at account-creation time.
        },
      },
    },
    account: {
      create: {
        after: promoteDemoOnOAuth,
      },
    },
  },
  socialProviders,
  plugins: [
    bearer(),
    ...(stripeEnabled && stripeClient
      ? [
          stripePlugin({
            stripeClient,
            stripeWebhookSecret: STRIPE_WEBHOOK_SECRET!,
            createCustomerOnSignUp: false,
            subscription: {
              enabled: true,
              plans: [
                {
                  name: 'pro',
                  priceId: STRIPE_PRICE_PRO_MONTHLY!,
                  annualDiscountPriceId: STRIPE_PRICE_PRO_YEARLY || undefined,
                },
              ],
              onSubscriptionComplete: async ({ subscription }) => {
                const userId = subscription.referenceId
                const { rows } = await query<{ email: string; name: string | null }>(
                  'UPDATE "user" SET tier = $1, "tierSource" = $2 WHERE id = $3 RETURNING email, name',
                  ['pro', 'stripe', userId]
                )
                // If the visitor parked demo data at signup, finalize the
                // carryover now that they've upgraded to Pro. Best-effort —
                // a failure shouldn't undo the Pro upgrade itself.
                try {
                  await finalizeProCarryover(userId)
                } catch (err) {
                  console.error('[auth] Pro carryover failed for', userId, err)
                }
                if (rows[0]) {
                  try {
                    await sendWelcomeEmailFor(rows[0], 'pro')
                  } catch (err) {
                    console.error(
                      '[auth] Pro welcome email failed for',
                      userId,
                      err
                    )
                  }
                }
              },
              onSubscriptionDeleted: async ({ subscription }) => {
                await query(
                  'UPDATE "user" SET tier = $1, "tierSource" = $2 WHERE id = $3',
                  ['free', 'stripe', subscription.referenceId]
                )
              },
            },
          }),
        ]
      : []),
  ],
  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:3001',
    ...(BETTER_AUTH_URL ? [BETTER_AUTH_URL] : []),
  ],
})
