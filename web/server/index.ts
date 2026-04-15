import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import todosRouter from './routes/todos.js'
import listsRouter from './routes/lists.js'
import categoriesRouter from './routes/categories.js'
import settingsRouter from './routes/settings.js'
import authRouter from './routes/auth.js'
import { authMiddleware } from './middleware/auth.js'
import { initDb } from './db.js'

const app = express()
const PORT = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api', authRouter)

app.use('/api', authMiddleware)

app.use('/api/todos', todosRouter)
app.use('/api/lists', listsRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/settings', settingsRouter)

// In production, serve the Vite build and let Vue Router handle the rest
if (isProd) {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get(/.*/, (_req, res) => {
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
