import { Router } from 'express'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'

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
  const secret = process.env.JWT_SECRET

  if (!validUsername || !validPassword || !secret) {
    res.status(500).json({ error: 'Server authentication is not configured' })
    return
  }

  if (username === validUsername && password === validPassword) {
    const token = jwt.sign({ username }, secret, { expiresIn: '7d' })
    res.json({ token })
  } else {
    res.status(401).json({ error: 'Invalid credentials' })
  }
})

export default router
