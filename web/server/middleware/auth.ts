import type { Request, Response, NextFunction } from 'express'

export const validTokens = new Set<string>()

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const token = authHeader.slice(7)
  if (!validTokens.has(token)) {
    res.status(401).json({ error: 'Invalid token' })
    return
  }

  next()
}
