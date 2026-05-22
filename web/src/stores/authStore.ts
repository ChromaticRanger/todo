import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
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

  // Post-signup email-verification state. The email/password signup flow can't
  // sign the user in until they verify, so LoginPage shows a "check your inbox"
  // card. It lives here rather than in LoginPage's local state because signUp
  // triggers a session refetch that briefly unmounts LoginPage — local state
  // would be lost across that remount, store state survives it.
  const awaitingVerificationEmail = ref<string | null>(null)

  // Once the user is actually signed in, the verification prompt is moot.
  watch(isAuthenticated, (authed) => {
    if (authed) awaitingVerificationEmail.value = null
  })

  // isAdmin lives on the server (env-var allowlist), not on the Better Auth
  // session. We learn it via /api/account; this ref caches the answer per
  // signed-in user and is refreshed when the user identity changes.
  const isAdmin = ref(false)
  const adminFetchedForUserId = ref<string | null>(null)

  async function refreshAdminFlag(forceUserId?: string | null) {
    const targetId = forceUserId ?? user.value?.id ?? null
    if (!targetId) {
      isAdmin.value = false
      adminFetchedForUserId.value = null
      return
    }
    try {
      const res = await fetch('/api/account', { credentials: 'include' })
      if (!res.ok) {
        isAdmin.value = false
        return
      }
      const body = (await res.json()) as { isAdmin?: boolean }
      isAdmin.value = !!body.isAdmin
      adminFetchedForUserId.value = targetId
    } catch {
      isAdmin.value = false
    }
  }

  watch(
    () => user.value?.id ?? null,
    (id) => {
      if (id && id !== adminFetchedForUserId.value) {
        refreshAdminFlag(id)
      } else if (!id) {
        isAdmin.value = false
        adminFetchedForUserId.value = null
      }
    },
    { immediate: true }
  )

  async function refreshUser() {
    await session.value.refetch()
  }

  async function logout() {
    await authClient.signOut()
    isAdmin.value = false
    adminFetchedForUserId.value = null
    await session.value.refetch()
  }

  return {
    session,
    user,
    isAuthenticated,
    loading,
    tier,
    needsPlanChoice,
    awaitingVerificationEmail,
    isAdmin,
    refreshUser,
    refreshAdminFlag,
    logout,
  }
})
