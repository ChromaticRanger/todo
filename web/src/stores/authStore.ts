import { defineStore } from 'pinia'
import { computed } from 'vue'
import { authClient } from '../lib/auth-client'

export const useAuthStore = defineStore('auth', () => {
  const session = authClient.useSession()

  const isAuthenticated = computed(() => !!session.value.data?.user)
  const user = computed(() => session.value.data?.user ?? null)
  const loading = computed(() => session.value.isPending)

  async function logout() {
    await authClient.signOut()
    await session.value.refetch()
  }

  return { session, user, isAuthenticated, loading, logout }
})
