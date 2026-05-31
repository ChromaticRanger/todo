/**
 * Safety net for the demo *template* user (`demo-user`).
 *
 * Per-visitor demo sessions get their own ephemeral `demo-<uuid>` user (see
 * `routes/demo.ts`), so their writes go through normally — the calendar
 * refetches see them, time-windowed views update, list cloning works.
 *
 * The shared `demo-user` row holds the canonical seed content that gets
 * cloned on every `/api/demo/start`. Writes from THAT id would corrupt the
 * seed for future visitors, so we silently no-op them here as a safety net
 * — nobody should ever sign in as the template, but if a misconfiguration
 * or test ever does, the seed stays intact.
 */
import type { Request, Response, NextFunction } from 'express'

const TEMPLATE_USER_ID = 'demo-user'
const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH'])

export function demoNoop(req: Request, res: Response, next: NextFunction) {
  if (req.userId !== TEMPLATE_USER_ID) return next()
  if (!WRITE_METHODS.has(req.method)) return next()
  // /api/auth/* is mounted before this middleware, but /api/demo/* arrives
  // here and must pass through so /demo/end can sign out cleanly.
  if (req.path.startsWith('/demo/')) return next()

  if (req.method === 'POST' && req.path === '/todos') {
    return res.status(201).json({ id: -Math.floor(Math.random() * 1_000_000_000) })
  }
  res.status(200).json({ ok: true })
}
