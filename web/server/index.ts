import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { toNodeHandler } from 'better-auth/node'
import { auth } from './auth.js'
import todosRouter from './routes/todos.js'
import listsRouter from './routes/lists.js'
import categoriesRouter from './routes/categories.js'
import settingsRouter from './routes/settings.js'
import planRouter from './routes/plan.js'
import searchRouter from './routes/search.js'
import { authMiddleware } from './middleware/auth.js'
import { requirePlan } from './middleware/requirePlan.js'
import { rateLimit } from './middleware/rateLimit.js'
import { initDb } from './db.js'

const app = express()
const PORT = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(
  cors({
    origin: (origin, cb) => cb(null, origin ?? true),
    credentials: true,
  })
)

// Better Auth handler — must be mounted BEFORE express.json() since it reads the raw body itself
app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api', authMiddleware)

// Plan selection lives outside requirePlan — a tier-less user must be able
// to reach /api/plan/select-free on first login.
app.use('/api/plan', planRouter)

// Everything below requires the user to have chosen a plan.
app.use('/api', requirePlan)
app.use('/api', rateLimit)

app.use('/api/todos', todosRouter)
app.use('/api/lists', listsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/search', searchRouter)

// In production, serve the Vite build and let Vue Router handle the rest
if (isProd) {
  const distPath = path.join(__dirname, '../dist')

  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    immutable: true,
    maxAge: '1y',
  }))

  app.use(express.static(distPath))

  app.get(/.*/, (req, res) => {
    if (path.extname(req.path)) return res.status(404).end()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`)
    })
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err)
    process.exit(1)
  })
