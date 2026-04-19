import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient({
  // Same-origin (Vite proxy rewrites /api → express), so no baseURL needed.
})

export const { signIn, signUp, signOut, useSession, getSession } = authClient
