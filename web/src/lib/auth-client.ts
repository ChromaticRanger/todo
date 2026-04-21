import { createAuthClient } from 'better-auth/vue'
import { inferAdditionalFields } from 'better-auth/client/plugins'
import { stripeClient } from '@better-auth/stripe/client'

export const authClient = createAuthClient({
  // Same-origin (Vite proxy rewrites /api → express), so no baseURL needed.
  plugins: [
    inferAdditionalFields({
      user: {
        tier: { type: 'string', required: false, input: false },
      },
    }),
    stripeClient({ subscription: true }),
  ],
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
