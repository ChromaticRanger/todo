import { Router } from 'express'
import { query } from '../db.js'

const router = Router()

// ── Helpers ─────────────────────────────────────────────────────────────────

function addMonths(epochSecs: number, months: number): number {
  const d = new Date(epochSecs * 1000)
  d.setMonth(d.getMonth() + months)
  return Math.floor(d.getTime() / 1000)
}

interface TodoRow {
  id: number
  list_name: string
  title: string
  description: string
  category: string
  priority: number
  status: number
  created_at: Date | number | null
  completed_at: Date | number | null
  due_date: number | null
  repeat_days: number
  repeat_months: number
  spawned_next: number
  type: string
  url: string | null
}

// pg serializes BIGINT/NUMERIC as strings; coerce to numbers for the client
function coerceTodo(row: TodoRow) {
  return {
    ...row,
    id: Number(row.id),
    priority: Number(row.priority),
    status: Number(row.status),
    created_at: row.created_at != null ? Number(row.created_at) : null,
    completed_at: row.completed_at != null ? Number(row.completed_at) : null,
    due_date: row.due_date != null ? Number(row.due_date) : null,
    repeat_days: Number(row.repeat_days),
    repeat_months: Number(row.repeat_months),
    spawned_next: Number(row.spawned_next),
    type: (row.type as string) || 'todo',
    url: row.url ?? null,
  }
}

async function spawnRepeatingTodos(listName: string) {
  // Find repeating todos that are completed but haven't spawned yet
  const result = await query<TodoRow>(
    `SELECT * FROM todos
     WHERE list_name = $1
       AND status = 1
       AND spawned_next = 0
       AND (repeat_days > 0 OR repeat_months > 0)`,
    [listName]
  )

  const now = Math.floor(Date.now() / 1000)

  for (const todo of result.rows) {
    const dueBase = todo.due_date != null ? Number(todo.due_date) : now
    let newDue: number

    if (Number(todo.repeat_days) > 0) {
      newDue = dueBase + Number(todo.repeat_days) * 86400
      while (newDue < now) newDue += Number(todo.repeat_days) * 86400
    } else {
      newDue = addMonths(dueBase, Number(todo.repeat_months))
      while (newDue < now) newDue = addMonths(newDue, Number(todo.repeat_months))
    }

    await query(
      `INSERT INTO todos
         (list_name, title, description, category, priority, status,
          due_date, repeat_days, repeat_months, spawned_next)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,0)`,
      [
        listName,
        todo.title,
        todo.description,
        todo.category,
        todo.priority,
        newDue,
        todo.repeat_days,
        todo.repeat_months,
      ]
    )

    await query('UPDATE todos SET spawned_next = 1 WHERE id = $1', [todo.id])
  }
}

function buildTodoSelect(extra = ''): string {
  return `SELECT id, list_name, title, description, category, priority, status,
    EXTRACT(EPOCH FROM created_at)::BIGINT AS created_at,
    EXTRACT(EPOCH FROM completed_at)::BIGINT AS completed_at,
    due_date, repeat_days, repeat_months, spawned_next, type, url
  FROM todos ${extra}`
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/todos?list=X&status=0|1|-1&category=X
router.get('/', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  const statusParam = req.query.status as string | undefined
  const category = req.query.category as string | undefined

  try {
    await spawnRepeatingTodos(list)

    const params: unknown[] = [list]
    const conditions: string[] = ['list_name = $1']

    if (statusParam !== undefined && statusParam !== '-1') {
      params.push(parseInt(statusParam))
      conditions.push(`status = $${params.length}`)
    }

    if (category) {
      params.push(category)
      conditions.push(`category = $${params.length}`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const result = await query<TodoRow>(
      buildTodoSelect(`${where} ORDER BY priority DESC, id ASC`),
      params
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/today?list=X
router.get('/today', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(list)
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE list_name = $1 AND status = 0 AND type = 'todo'
         AND due_date IS NOT NULL
         AND due_date >= EXTRACT(EPOCH FROM CURRENT_DATE)::BIGINT
         AND due_date < EXTRACT(EPOCH FROM CURRENT_DATE + INTERVAL '1 day')::BIGINT
         ORDER BY due_date ASC`
      ),
      [list]
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/week?list=X
router.get('/week', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(list)
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE list_name = $1 AND status = 0 AND type = 'todo'
         AND due_date IS NOT NULL
         AND due_date >= EXTRACT(EPOCH FROM CURRENT_DATE)::BIGINT
         AND due_date < EXTRACT(EPOCH FROM CURRENT_DATE + INTERVAL '7 days')::BIGINT
         ORDER BY due_date ASC`
      ),
      [list]
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/month?list=X
router.get('/month', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(list)
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE list_name = $1 AND status = 0 AND type = 'todo'
         AND due_date IS NOT NULL
         AND due_date >= EXTRACT(EPOCH FROM CURRENT_DATE)::BIGINT
         AND due_date < EXTRACT(EPOCH FROM CURRENT_DATE + INTERVAL '30 days')::BIGINT
         ORDER BY due_date ASC`
      ),
      [list]
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/schedule?list=X
router.get('/schedule', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(list)
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE list_name = $1 AND status = 0 AND type = 'todo'
         AND due_date IS NOT NULL
         ORDER BY due_date ASC`
      ),
      [list]
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/completed?list=X&since=epoch
router.get('/completed', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  const since = req.query.since ? parseInt(req.query.since as string) : 0
  try {
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE list_name = $1 AND status = 1 AND type = 'todo'
         AND (EXTRACT(EPOCH FROM completed_at)::BIGINT >= $2 OR $2 = 0)
         ORDER BY completed_at DESC`
      ),
      [list, since]
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query<TodoRow>(
      buildTodoSelect('WHERE id = $1'),
      [req.params.id]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ todo: coerceTodo(result.rows[0]) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/todos
router.post('/', async (req, res) => {
  const {
    list_name = 'todos',
    title,
    description = '',
    category = 'General',
    priority = 2,
    due_date = null,
    repeat_days = 0,
    repeat_months = 0,
    type = 'todo',
    url = null,
  } = req.body as Partial<{
    list_name: string
    title: string
    description: string
    category: string
    priority: number
    due_date: number | null
    repeat_days: number
    repeat_months: number
    type: string
    url: string | null
  }>

  if (!title) return res.status(400).json({ error: 'Title is required' })
  if (type === 'bookmark' && !url) return res.status(400).json({ error: 'URL is required for bookmarks' })

  try {
    const effectiveDue =
      due_date ?? ((repeat_days > 0 || repeat_months > 0) ? Math.floor(Date.now() / 1000) : null)

    const result = await query<{ id: number }>(
      `INSERT INTO todos
         (list_name, title, description, category, priority, status,
          due_date, repeat_days, repeat_months, spawned_next, type, url)
       VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,0,$9,$10) RETURNING id`,
      [list_name, title, description, category, priority, effectiveDue, repeat_days, repeat_months, type, url]
    )
    res.status(201).json({ id: Number(result.rows[0].id) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/todos/:id
router.put('/:id', async (req, res) => {
  const { title, description, category, priority, due_date, url } = req.body as Partial<{
    title: string
    description: string
    category: string
    priority: number
    due_date: number | null
    url: string | null
  }>

  try {
    await query(
      `UPDATE todos SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         priority = COALESCE($4, priority),
         due_date = $5,
         url = COALESCE($6, url)
       WHERE id = $7`,
      [title, description, category, priority, due_date ?? null, url ?? null, req.params.id]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/todos/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await query('DELETE FROM todos WHERE id = $1', [req.params.id])
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/todos/:id/complete
router.post('/:id/complete', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  try {
    await query(
      `UPDATE todos SET status = 1, completed_at = NOW()
       WHERE id = $1 AND list_name = $2`,
      [req.params.id, list]
    )
    await spawnRepeatingTodos(list)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/todos/:id/uncomplete
router.post('/:id/uncomplete', async (req, res) => {
  const list = (req.query.list as string) || 'todos'
  try {
    await query(
      `UPDATE todos SET status = 0, completed_at = NULL
       WHERE id = $1 AND list_name = $2`,
      [req.params.id, list]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/todos/:id/move
router.post('/:id/move', async (req, res) => {
  const { target_list, target_category } = req.body as {
    target_list: string
    target_category?: string
  }
  if (!target_list) return res.status(400).json({ error: 'target_list is required' })
  try {
    const cat = (target_category ?? '').trim()
    const result = cat
      ? await query(
          'UPDATE todos SET list_name = $1, category = $2 WHERE id = $3',
          [target_list, cat, req.params.id]
        )
      : await query(
          'UPDATE todos SET list_name = $1 WHERE id = $2',
          [target_list, req.params.id]
        )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
