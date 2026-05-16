// Thin wrappers around chrome.storage.local for the bearer token.
// Anything that needs the token reads it through getToken() so the storage
// key lives in exactly one place.

const TOKEN_KEY = 'token'
const EXPIRES_KEY = 'expiresAt'

export interface StoredToken {
  token: string
  expiresAt: string | number | null
}

export async function getToken(): Promise<StoredToken | null> {
  const data = await chrome.storage.local.get([TOKEN_KEY, EXPIRES_KEY])
  const token = data[TOKEN_KEY] as string | undefined
  if (!token) return null
  return {
    token,
    expiresAt: (data[EXPIRES_KEY] as string | number | null | undefined) ?? null,
  }
}

export async function setToken(token: string, expiresAt: string | number): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token, [EXPIRES_KEY]: expiresAt })
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove([TOKEN_KEY, EXPIRES_KEY])
}
