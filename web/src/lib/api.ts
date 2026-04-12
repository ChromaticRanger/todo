import { useAuthStore } from '../stores/authStore'

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authStore = useAuthStore()
  const headers = new Headers(options.headers)

  if (authStore.token) {
    headers.set('Authorization', `Bearer ${authStore.token}`)
  }

  const res = await fetch(url, { ...options, headers })

  if (res.status === 401) {
    authStore.logout()
  }

  return res
}
