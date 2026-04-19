import type { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth.js'

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })

    if (!session?.user?.id) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    req.userId = session.user.id
    next()
  } catch (err) {
    console.error('[auth] session lookup failed:', err)
    res.status(401).json({ error: 'Unauthorized' })
  }
}
