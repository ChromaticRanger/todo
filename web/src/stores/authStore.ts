import { defineStore } from 'pinia'
import { computed } from 'vue'
import { authClient } from '../lib/auth-client'

export const useAuthStore = defineStore('auth', () => {
  const session = authClient.useSession()

  const isAuthenticated = computed(() => !!session.value.data?.user)
  const user = computed(() => session.value.data?.user ?? null)
  const loading = computed(() => session.value.isPending)

  const tier = computed<'free' | 'pro' | null>(() => {
    const raw = (user.value as { tier?: string | null } | null)?.tier ?? null
    return raw === 'free' || raw === 'pro' ? raw : null
  })
  const needsPlanChoice = computed(() => isAuthenticated.value && !tier.value)

  async function refreshUser() {
    await session.value.refetch()
  }

  async function logout() {
    await authClient.signOut()
    await session.value.refetch()
  }

  return { session, user, isAuthenticated, loading, tier, needsPlanChoice, refreshUser, logout }
})
