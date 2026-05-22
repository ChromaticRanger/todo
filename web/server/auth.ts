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
                const { rows } = await query<{ email: string; name: string | null }>(
                  'UPDATE "user" SET tier = $1, "tierSource" = $2 WHERE id = $3 RETURNING email, name',
                  ['pro', 'stripe', subscription.referenceId]
                )
                if (rows[0]) {
                  try {
                    await sendWelcomeEmailFor(rows[0], 'pro')
                  } catch (err) {
                    console.error(
                      '[auth] Pro welcome email failed for',
                      subscription.referenceId,
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
