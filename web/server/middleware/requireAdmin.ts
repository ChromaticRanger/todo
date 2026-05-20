import type { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth.js'

declare module 'express-serve-static-core' {
  interface Request {
    adminEmail?: string
  }
}

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
)

if (adminEmails.size === 0) {
  console.warn(
    '[admin] ADMIN_EMAILS is empty — the Admin Dashboard is locked out for everyone. Set ADMIN_EMAILS=you@example.com in .env to enable it.'
  )
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails.has(email.trim().toLowerCase())
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    const email = session?.user?.email
    if (!email || !isAdminEmail(email)) {
      res.status(403).json({ error: 'forbidden' })
      return
    }
    req.adminEmail = email
    next()
  } catch (err) {
    console.error('[requireAdmin] session lookup failed:', err)
    res.status(403).json({ error: 'forbidden' })
  }
}
