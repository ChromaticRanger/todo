import { API_ORIGIN } from './config'
import { clearToken, getToken } from './auth'

export class NotConnectedError extends Error {
  constructor() {
    super('Not connected to Stash Squirrel')
  }
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(typeof body === 'object' && body && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${status}`)
  }
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const stored = await getToken()
  if (!stored) throw new NotConnectedError()

  const res = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${stored.token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  })

  // A 401 means the token was revoked or expired. Drop it so the popup
  // falls back to the connect flow next time.
  if (res.status === 401) {
    await clearToken()
    throw new NotConnectedError()
  }

  return res
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

export async function fetchLists(): Promise<string[]> {
  const res = await authedFetch('/api/lists')
  const data = await readJson<{ lists: string[] }>(res)
  return data.lists
}

export async function fetchCategories(list: string): Promise<string[]> {
  const res = await authedFetch(`/api/categories?list=${encodeURIComponent(list)}`)
  const data = await readJson<{ categories: string[] }>(res)
  return data.categories
}

export interface CreateBookmarkInput {
  list_name: string
  title: string
  url: string
  category?: string
  description?: string
}

export async function createBookmark(input: CreateBookmarkInput): Promise<void> {
  const res = await authedFetch('/api/todos', {
    method: 'POST',
    body: JSON.stringify({
      ...input,
      type: 'bookmark',
      priority: 0,
    }),
  })
  await readJson(res)
}

export async function revokeToken(): Promise<void> {
  // Best-effort: tell the server to invalidate the session, then clear locally
  // regardless of what the server says.
  try {
    const stored = await getToken()
    if (stored) {
      await fetch(`${API_ORIGIN}/api/extension/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${stored.token}` },
      })
    }
  } catch {
    // ignore — local clear is what actually matters for the extension UX
  }
  await clearToken()
}
