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

  // Server-side flags that aren't on the Better Auth session: isAdmin
  // (env-var allowlist), isDemo (id starts with 'demo-'), and
  // signupCarriedDemoData (signup parked demo data, plan choice resolves).
  const isAdmin = ref(false)
  const isDemo = ref(false)
  const signupCarriedDemoData = ref(false)
  const adminFetchedForUserId = ref<string | null>(null)

  async function refreshAdminFlag(forceUserId?: string | null) {
    const targetId = forceUserId ?? user.value?.id ?? null
    if (!targetId) {
      isAdmin.value = false
      isDemo.value = false
      signupCarriedDemoData.value = false
      adminFetchedForUserId.value = null
      return
    }
    try {
      const res = await fetch('/api/account', { credentials: 'include' })
      if (!res.ok) {
        isAdmin.value = false
        isDemo.value = false
        signupCarriedDemoData.value = false
        return
      }
      const body = (await res.json()) as {
        isAdmin?: boolean
        isDemo?: boolean
        signupCarriedDemoData?: boolean
      }
      isAdmin.value = !!body.isAdmin
      isDemo.value = !!body.isDemo
      signupCarriedDemoData.value = !!body.signupCarriedDemoData
      adminFetchedForUserId.value = targetId
    } catch {
      isAdmin.value = false
      isDemo.value = false
      signupCarriedDemoData.value = false
    }
  }

  watch(
    () => user.value?.id ?? null,
    (id) => {
      if (id && id !== adminFetchedForUserId.value) {
        refreshAdminFlag(id)
      } else if (!id) {
        isAdmin.value = false
        isDemo.value = false
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
    isDemo.value = false
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
    isDemo,
    signupCarriedDemoData,
    refreshUser,
    refreshAdminFlag,
    logout,
  }
})
