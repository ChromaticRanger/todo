import 'dotenv/config'
import { betterAuth } from 'better-auth'
import { pool } from './db.js'

const {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
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

export const auth = betterAuth({
  appName: 'Stash Squirrel',
  database: pool,
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      console.log(`[auth] password reset for ${user.email}: ${url}`)
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`[auth] verify email for ${user.email}: ${url}`)
    },
  },
  socialProviders,
  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:3001',
    ...(BETTER_AUTH_URL ? [BETTER_AUTH_URL] : []),
  ],
})
