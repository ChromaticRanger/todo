import { rateLimit as rateLimiter, ipKeyGenerator } from 'express-rate-limit'

const freePerMin = Number(process.env.RATE_LIMIT_FREE_PER_MIN ?? 60)
const proPerMin = Number(process.env.RATE_LIMIT_PRO_PER_MIN ?? 600)

export const rateLimit = rateLimiter({
  windowMs: 60_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.userId ?? ipKeyGenerator(req.ip ?? ''),
  max: (req) => (req.plan === 'pro' ? proPerMin : freePerMin),
  message: { error: 'rate_limited' },
})
