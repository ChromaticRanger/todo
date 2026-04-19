import { authClient } from './auth-client'

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
  })

  if (res.status === 401) {
    await authClient.signOut().catch(() => {})
  }

  return res
}
