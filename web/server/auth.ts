import 'dotenv/config'
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins'
import Stripe from 'stripe'
import { stripe as stripePlugin } from '@better-auth/stripe'
import { pool, query, seedUserDefaults } from './db.js'
import { sendVerificationEmailFor, sendPasswordResetEmailFor } from './lib/email.js'

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
                await query('UPDATE "user" SET tier = $1 WHERE id = $2', [
                  'pro',
                  subscription.referenceId,
                ])
              },
              onSubscriptionDeleted: async ({ subscription }) => {
                await query('UPDATE "user" SET tier = $1 WHERE id = $2', [
                  'free',
                  subscription.referenceId,
                ])
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
