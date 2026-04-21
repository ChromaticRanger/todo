import { authClient } from './auth-client'

let lastRateLimitAt = 0
/** Subscribed by UI to show a toast without creating a store cycle. */
export const apiEvents = new EventTarget()

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
  })

  if (res.status === 401) {
    await authClient.signOut().catch(() => {})
    return res
  }

  if (res.status === 402) {
    // No plan on the user yet — refresh session so App.vue re-renders ChoosePlan.
    const { useAuthStore } = await import('../stores/authStore')
    await useAuthStore().refreshUser()
    return res
  }

  if (res.status === 429) {
    const now = Date.now()
    if (now - lastRateLimitAt > 5000) {
      lastRateLimitAt = now
      apiEvents.dispatchEvent(
        new CustomEvent('rate-limited', {
          detail: { retryAfter: res.headers.get('Retry-After') },
        })
      )
    }
  }

  return res
}
