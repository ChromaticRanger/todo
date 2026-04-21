import type { Request, Response, NextFunction } from 'express'
import { query } from '../db.js'

export type Plan = 'free' | 'pro'

declare module 'express-serve-static-core' {
  interface Request {
    plan?: Plan
  }
}

export async function requirePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = await query<{ tier: string | null }>(
      'SELECT tier FROM "user" WHERE id = $1',
      [req.userId]
    )
    const tier = rows[0]?.tier
    if (tier !== 'free' && tier !== 'pro') {
      res.status(402).json({ error: 'no_plan' })
      return
    }
    req.plan = tier
    next()
  } catch (err) {
    console.error('[requirePlan] failed:', err)
    res.status(500).json({ error: 'plan_lookup_failed' })
  }
}
