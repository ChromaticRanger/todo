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
import importRouter from './routes/import.js'
import sharedRouter from './routes/shared.js'
import extensionRouter from './routes/extension.js'
import accountRouter from './routes/account.js'
import adminRouter from './routes/admin.js'
import demoRouter from './routes/demo.js'
import cronRouter from './routes/cron.js'
import { authMiddleware } from './middleware/auth.js'
import { requirePlan } from './middleware/requirePlan.js'
import { rateLimit } from './middleware/rateLimit.js'
import { demoNoop } from './middleware/demoNoop.js'
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

// Demo endpoints (/start, /end) must be reachable without an existing
// session — a cold visitor clicking "See it in action" has no auth yet.
// Mount BEFORE authMiddleware.
app.use('/api/demo', demoRouter)

// Scheduled-job trigger (daily digest). Authenticated by a shared secret in the
// request, not a user session, so it mounts before authMiddleware.
app.use('/api/cron', cronRouter)

app.use('/api', authMiddleware)

// Silently no-op writes from the shared demo user so visitors can explore
// the product without polluting the seed for the next visitor.
app.use('/api', demoNoop)

// Plan selection lives outside requirePlan — a tier-less user must be able
// to reach /api/plan/select-free on first login.
app.use('/api/plan', planRouter)

// Extension token mint/revoke also bypasses requirePlan so the connect flow
// doesn't break for a user who hasn't picked a plan yet.
app.use('/api/extension', extensionRouter)

// Account routes (profile read, account delete) also bypass requirePlan so a
// user mid-signup can still delete their account if they change their mind.
app.use('/api/account', accountRouter)

// Admin Dashboard routes — gated by ADMIN_EMAILS, not by tier, so we mount
// before requirePlan.
app.use('/api/admin', adminRouter)

// Everything below requires the user to have chosen a plan.
app.use('/api', requirePlan)
app.use('/api', rateLimit)

app.use('/api/todos', todosRouter)
app.use('/api/lists', listsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/search', searchRouter)
app.use('/api/import', importRouter)
app.use('/api/shared', sharedRouter)

// In production, serve the Vite build and let Vue Router handle the rest
if (isProd) {
  const distPath = path.join(__dirname, '../dist')

  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    immutable: true,
    maxAge: '1y',
  }))

  app.use(express.static(distPath))

  app.get('/privacy', (_req, res) => {
    res.sendFile(path.join(distPath, 'privacy.html'))
  })

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
