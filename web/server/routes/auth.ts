import { Router } from 'express'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import { validTokens } from '../middleware/auth.js'

const router = Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string }

  const validUsername = process.env.AUTH_USERNAME
  const validPassword = process.env.AUTH_PASSWORD

  if (!validUsername || !validPassword) {
    res.status(500).json({ error: 'Server authentication is not configured' })
    return
  }

  if (username === validUsername && password === validPassword) {
    const token = crypto.randomUUID()
    validTokens.add(token)
    res.json({ token })
  } else {
    res.status(401).json({ error: 'Invalid credentials' })
  }
})

export default router
