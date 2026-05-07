/**
 * Normalize a URL for dedupe comparisons:
 *   - lowercase host
 *   - drop URL fragment
 *   - strip a single trailing slash from a non-root path
 *   - keep query string intact
 *
 * Falls back to the raw input if it doesn't parse — never throws.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.hash = ''
    u.hostname = u.hostname.toLowerCase()
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '')
    }
    return u.toString()
  } catch {
    return raw
  }
}
