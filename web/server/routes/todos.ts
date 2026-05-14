import { Router } from 'express'
import { query } from '../db.js'
import { LIMITS, countUserLists, countUserItems, userHasList } from '../lib/limits.js'

const router = Router()

// ── Helpers ─────────────────────────────────────────────────────────────────

function addMonths(epochSecs: number, months: number): number {
  const d = new Date(epochSecs * 1000)
  d.setMonth(d.getMonth() + months)
  return Math.floor(d.getTime() / 1000)
}

export interface TodoRow {
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
  snoozed_until: number | null
  recur_until: number | null
}

// pg serializes BIGINT/NUMERIC as strings; coerce to numbers for the client
export function coerceTodo(row: TodoRow) {
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
    snoozed_until: row.snoozed_until != null ? Number(row.snoozed_until) : null,
    recur_until: row.recur_until != null ? Number(row.recur_until) : null,
  }
}

// Spawn-on-completion model for recurring TODOS only. Events use virtual
// expansion at read time (see `expandEventOccurrences` below) because they
// never get completed — there's no natural trigger to spawn the next row.
async function spawnRepeatingTodos(userId: string, listName: string) {
  const result = await query<TodoRow>(
    `SELECT * FROM todos
     WHERE user_id = $1
       AND list_name = $2
       AND status = 1
       AND spawned_next = 0
       AND type = 'todo'
       AND (repeat_days > 0 OR repeat_months > 0)`,
    [userId, listName]
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
         (user_id, list_name, title, description, category, priority, status,
          due_date, repeat_days, repeat_months, spawned_next)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,0)`,
      [
        userId,
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

    await query(
      'UPDATE todos SET spawned_next = 1 WHERE id = $1 AND user_id = $2',
      [todo.id, userId]
    )
  }
}

// ── Recurring event expansion ────────────────────────────────────────────────
//
// Recurring events are stored as a single "series" row (the anchor date in
// `due_date`, the cadence in `repeat_days`/`repeat_months`, an optional
// `recur_until` cutoff). Read endpoints fetch the series and expand it into
// virtual occurrences inside the requested [from, to] window. The expanded
// rows are clones of the series with a per-occurrence `due_date`; their `id`
// is the series id, so edits/deletes against any occurrence act on the series.

const MAX_OCCURRENCES_PER_SERIES = 500 // safety cap; v1 presets never reach this

export function expandEventOccurrences(
  series: TodoRow[],
  from: number,
  to: number
): TodoRow[] {
  const out: TodoRow[] = []
  for (const ev of series) {
    const stepDays = Number(ev.repeat_days)
    const stepMonths = Number(ev.repeat_months)
    const isRecurring = stepDays > 0 || stepMonths > 0
    const base = ev.due_date != null ? Number(ev.due_date) : null
    if (base == null) continue

    if (!isRecurring) {
      if (base >= from && base < to) out.push(ev)
      continue
    }

    const until = ev.recur_until != null ? Number(ev.recur_until) : Infinity
    let occ = base

    // Fast-forward to the first occurrence >= from.
    if (occ < from) {
      if (stepDays > 0) {
        const stepSec = stepDays * 86400
        const skips = Math.floor((from - occ) / stepSec)
        occ += skips * stepSec
        while (occ < from) occ += stepSec
      } else {
        // Monthly: iterate so JS setMonth handles 31st → 28th/29th/30th
        // boundaries and Feb 29 yearly anchors correctly.
        while (occ < from) occ = addMonths(occ, stepMonths)
      }
    }

    let safety = 0
    while (occ < to && occ <= until && safety++ < MAX_OCCURRENCES_PER_SERIES) {
      out.push({ ...ev, due_date: occ })
      if (stepDays > 0) occ += stepDays * 86400
      else occ = addMonths(occ, stepMonths)
    }
  }
  return out
}

// Loads the user's recurring event series that could produce an occurrence in
// [from, to] and returns the expanded virtual rows. Cheap: the partial index
// `todos_event_series_idx` keeps the lookup small.
async function fetchExpandedEventSeries(
  userId: string,
  from: number,
  to: number
): Promise<TodoRow[]> {
  const result = await query<TodoRow>(
    buildTodoSelect(
      `WHERE user_id = $1 AND status = 0 AND type = 'event'
       AND (repeat_days > 0 OR repeat_months > 0)
       AND due_date IS NOT NULL
       AND due_date < $3
       AND (recur_until IS NULL OR recur_until >= $2)`
    ),
    [userId, from, to]
  )
  return expandEventOccurrences(result.rows, from, to)
}

export function buildTodoSelect(extra = ''): string {
  return `SELECT id, list_name, title, description, category, priority, status,
    EXTRACT(EPOCH FROM created_at)::BIGINT AS created_at,
    EXTRACT(EPOCH FROM completed_at)::BIGINT AS completed_at,
    due_date, repeat_days, repeat_months, spawned_next, type, url, snoozed_until,
    recur_until
  FROM todos ${extra}`
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/todos?list=X&status=0|1|-1&category=X
router.get('/', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  const statusParam = req.query.status as string | undefined
  const category = req.query.category as string | undefined

  try {
    await spawnRepeatingTodos(userId, list)

    const params: unknown[] = [userId, list]
    const conditions: string[] = ['user_id = $1', 'list_name = $2']

    if (statusParam !== undefined && statusParam !== '-1') {
      params.push(parseInt(statusParam))
      conditions.push(`status = $${params.length}`)
    }

    if (category) {
      params.push(category)
      conditions.push(`category = $${params.length}`)
    }

    // Events live only on the Overall Schedule calendar — never surface them
    // in the per-list category view, even if they share a list_name with
    // a real list.
    conditions.push(`type <> 'event'`)

    // Hide actively-snoozed todos from the category view. Time-based views
    // (today/week/month/schedule) intentionally still surface them so an
    // overdue item doesn't vanish entirely.
    conditions.push(
      '(snoozed_until IS NULL OR snoozed_until <= EXTRACT(EPOCH FROM NOW())::BIGINT)'
    )

    const where = `WHERE ${conditions.join(' AND ')}`
    const result = await query<TodoRow>(
      buildTodoSelect(`${where} ORDER BY priority DESC, id ASC`),
      params
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Events live outside any user list, but should still surface on every
// time-windowed view (Today / Week / Month / Overdue / Schedule) regardless
// of which list is active. Recurring event series are excluded here — they're
// expanded virtually by `fetchExpandedEventSeries` and merged in by each route.
const TIME_WINDOWED_SCOPE =
  `(list_name = $2 AND type = 'todo')
   OR (type = 'event' AND repeat_days = 0 AND repeat_months = 0)`

// Shared helper for the today/week/month routes: fetch the regular rows from
// the time-windowed scope and merge expanded recurring-event occurrences.
async function fetchWindowedScope(
  userId: string,
  list: string,
  from: number,
  to: number
) {
  const [main, series] = await Promise.all([
    query<TodoRow>(
      buildTodoSelect(
        `WHERE user_id = $1 AND status = 0
         AND (${TIME_WINDOWED_SCOPE})
         AND due_date IS NOT NULL
         AND due_date >= $3 AND due_date < $4
         ORDER BY due_date ASC`
      ),
      [userId, list, from, to]
    ),
    fetchExpandedEventSeries(userId, from, to),
  ])
  const merged = [...main.rows, ...series].map(coerceTodo)
  merged.sort((a, b) => (a.due_date ?? 0) - (b.due_date ?? 0))
  return merged
}

// GET /api/todos/today?list=X
router.get('/today', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(userId, list)
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    res.json({ todos: await fetchWindowedScope(userId, list, dayStart, dayStart + 86400) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/week?list=X
router.get('/week', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(userId, list)
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    res.json({ todos: await fetchWindowedScope(userId, list, dayStart, dayStart + 7 * 86400) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/month?list=X
router.get('/month', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(userId, list)
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    res.json({ todos: await fetchWindowedScope(userId, list, dayStart, dayStart + 30 * 86400) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/calendar?from=<epoch>&to=<epoch>
// Cross-list calendar feed for the Pro-only Overall Schedule view.
// Returns dated, pending todos across every list the user owns.
router.get('/calendar', async (req, res) => {
  if (req.plan !== 'pro') return res.status(403).json({ error: 'pro_required' })
  const userId = req.userId!
  const from = Number(req.query.from)
  const to = Number(req.query.to)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return res.status(400).json({ error: 'from and to must be epoch seconds, with to > from' })
  }
  // 6-week visible grid is ~42 days; 70 leaves headroom without inviting abuse.
  const MAX_RANGE_SECONDS = 70 * 86400
  if (to - from > MAX_RANGE_SECONDS) {
    return res.status(400).json({ error: 'range_too_large', limit_days: 70 })
  }
  try {
    const [main, series] = await Promise.all([
      query<TodoRow>(
        buildTodoSelect(
          // Exclude recurring event series — they're expanded virtually below.
          `WHERE user_id = $1 AND status = 0
           AND (type = 'todo'
                OR (type = 'event' AND repeat_days = 0 AND repeat_months = 0))
           AND due_date IS NOT NULL
           AND due_date >= $2 AND due_date < $3
           ORDER BY due_date ASC`
        ),
        [userId, from, to]
      ),
      fetchExpandedEventSeries(userId, from, to),
    ])
    const merged = [...main.rows, ...series].map(coerceTodo)
    merged.sort((a, b) => (a.due_date ?? 0) - (b.due_date ?? 0))
    res.json({ todos: merged })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/counts?list=X
// Returns item counts per time-windowed view so the client can hint which
// views have anything in them. Single query so we don't fan out four requests.
router.get('/counts', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(userId, list)
    // Base counts: todos in the active list + non-recurring events. Recurring
    // event occurrences are tallied in JS below so a single birthday series
    // contributes to today/week/month at most once each, never to overdue.
    const [countsResult, seriesMonth] = await Promise.all([
      query<{ today: string; week: string; month: string; overdue: string }>(
        `WITH bounds AS (
           SELECT
             (FLOOR(EXTRACT(EPOCH FROM NOW()) / 86400) * 86400)::BIGINT AS day_start,
             EXTRACT(EPOCH FROM NOW())::BIGINT AS now_epoch
         )
         SELECT
           COUNT(*) FILTER (WHERE due_date >= b.day_start AND due_date < b.day_start + 86400) AS today,
           COUNT(*) FILTER (WHERE due_date >= b.day_start AND due_date < b.day_start + 7 * 86400) AS week,
           COUNT(*) FILTER (WHERE due_date >= b.day_start AND due_date < b.day_start + 30 * 86400) AS month,
           COUNT(*) FILTER (WHERE due_date < b.now_epoch) AS overdue
         FROM todos, bounds b
         WHERE user_id = $1 AND status = 0
           AND ((list_name = $2 AND type = 'todo')
                OR (type = 'event' AND repeat_days = 0 AND repeat_months = 0))
           AND due_date IS NOT NULL`,
        [userId, list]
      ),
      (async () => {
        const now = Math.floor(Date.now() / 1000)
        const dayStart = Math.floor(now / 86400) * 86400
        return fetchExpandedEventSeries(userId, dayStart, dayStart + 30 * 86400)
      })(),
    ])
    const row = countsResult.rows[0]
    // Bucket expanded recurring-event occurrences into the three windows.
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    let extraToday = 0, extraWeek = 0, extraMonth = 0
    for (const ev of seriesMonth) {
      const d = ev.due_date ?? 0
      if (d >= dayStart && d < dayStart + 86400) extraToday++
      if (d >= dayStart && d < dayStart + 7 * 86400) extraWeek++
      if (d >= dayStart && d < dayStart + 30 * 86400) extraMonth++
    }
    res.json({
      counts: {
        today: Number(row.today) + extraToday,
        week: Number(row.week) + extraWeek,
        month: Number(row.month) + extraMonth,
        overdue: Number(row.overdue),
      },
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/overdue?list=X
router.get('/overdue', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(userId, list)
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE user_id = $1 AND status = 0
         AND (${TIME_WINDOWED_SCOPE})
         AND due_date IS NOT NULL
         AND due_date < EXTRACT(EPOCH FROM NOW())::BIGINT
         ORDER BY due_date ASC`
      ),
      [userId, list]
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/schedule?list=X
// "All upcoming, no explicit window." For recurring events we cap expansion at
// one year out to prevent a 1985 birthday from generating decades of rows.
router.get('/schedule', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    await spawnRepeatingTodos(userId, list)
    const now = Math.floor(Date.now() / 1000)
    const horizon = now + 365 * 86400
    const [main, series] = await Promise.all([
      query<TodoRow>(
        buildTodoSelect(
          `WHERE user_id = $1 AND status = 0
           AND (${TIME_WINDOWED_SCOPE})
           AND due_date IS NOT NULL
           ORDER BY due_date ASC`
        ),
        [userId, list]
      ),
      fetchExpandedEventSeries(userId, now, horizon),
    ])
    const merged = [...main.rows, ...series].map(coerceTodo)
    merged.sort((a, b) => (a.due_date ?? 0) - (b.due_date ?? 0))
    res.json({ todos: merged })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/completed?list=X&since=epoch
router.get('/completed', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  const since = req.query.since ? parseInt(req.query.since as string) : 0
  try {
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE user_id = $1 AND list_name = $2 AND status = 1 AND type = 'todo'
         AND (EXTRACT(EPOCH FROM completed_at)::BIGINT >= $3 OR $3 = 0)
         ORDER BY completed_at DESC`
      ),
      [userId, list, since]
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/:id
router.get('/:id', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query<TodoRow>(
      buildTodoSelect('WHERE id = $1 AND user_id = $2'),
      [req.params.id, userId]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ todo: coerceTodo(result.rows[0]) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// Accepted recurrence presets for events (v1). Stored using the existing
// repeat_days / repeat_months columns; no new "freq" column.
const EVENT_RECURRENCE_PRESETS: ReadonlyArray<[number, number]> = [
  [0, 0],   // does not repeat
  [7, 0],   // weekly
  [0, 1],   // monthly
  [0, 12],  // yearly
]
function isValidEventRecurrence(days: number, months: number): boolean {
  return EVENT_RECURRENCE_PRESETS.some(([d, m]) => d === days && m === months)
}

// POST /api/todos
router.post('/', async (req, res) => {
  const userId = req.userId!
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
    recur_until = null,
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
    recur_until: number | null
  }>

  if (!title) return res.status(400).json({ error: 'Title is required' })
  if (type === 'bookmark' && !url) return res.status(400).json({ error: 'URL is required for bookmarks' })
  if (type === 'event') {
    if (req.plan !== 'pro') return res.status(403).json({ error: 'pro_required' })
    if (due_date == null) return res.status(400).json({ error: 'Date is required for events' })
    if (!isValidEventRecurrence(Number(repeat_days) || 0, Number(repeat_months) || 0)) {
      return res.status(400).json({ error: 'invalid_event_recurrence' })
    }
    if (recur_until != null && due_date != null && Number(recur_until) <= Number(due_date)) {
      return res.status(400).json({ error: 'recur_until must be after due_date' })
    }
  }

  // Events live outside any user list — pin them to a sentinel name and
  // skip list/category metadata so they can't accidentally surface in lists.
  const effectiveList = type === 'event' ? '__events__' : list_name
  const effectiveCategory = type === 'event' ? 'General' : category
  // Todos pass their repeat values straight through; events use them only when
  // the submitted pair is one of the accepted presets (validated above).
  const effectiveRepeatDays = type === 'event' ? Number(repeat_days) || 0 : repeat_days
  const effectiveRepeatMonths = type === 'event' ? Number(repeat_months) || 0 : repeat_months
  const effectiveUrl = type === 'event' ? null : url
  // recur_until is event-only; ignore it on todos to keep the contract crisp.
  const effectiveRecurUntil = type === 'event' ? (recur_until ?? null) : null

  try {
    if (req.plan === 'free') {
      if (!(await userHasList(userId, effectiveList))) {
        if ((await countUserLists(userId)) >= LIMITS.maxLists) {
          return res.status(403).json({ error: 'free_tier_list_limit', limit: LIMITS.maxLists })
        }
      }
      if ((await countUserItems(userId)) >= LIMITS.maxItems) {
        return res.status(403).json({ error: 'free_tier_item_limit', limit: LIMITS.maxItems })
      }
    }

    const effectiveDue =
      due_date ?? ((effectiveRepeatDays > 0 || effectiveRepeatMonths > 0) ? Math.floor(Date.now() / 1000) : null)

    const result = await query<{ id: number }>(
      `INSERT INTO todos
         (user_id, list_name, title, description, category, priority, status,
          due_date, repeat_days, repeat_months, spawned_next, type, url, recur_until)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,0,$10,$11,$12) RETURNING id`,
      [userId, effectiveList, title, description, effectiveCategory, priority, effectiveDue, effectiveRepeatDays, effectiveRepeatMonths, type, effectiveUrl, effectiveRecurUntil]
    )
    res.status(201).json({ id: Number(result.rows[0].id) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/todos/:id
router.put('/:id', async (req, res) => {
  const userId = req.userId!
  const body = req.body as Partial<{
    title: string
    description: string
    category: string
    priority: number
    due_date: number | null
    url: string | null
    repeat_days: number
    repeat_months: number
    recur_until: number | null
  }>
  const { title, description, category, priority, due_date, url } = body

  // Detect whether the client sent each recurrence field so we can distinguish
  // "leave unchanged" (undefined) from "clear" (null / 0).
  const hasRepeatDays = Object.prototype.hasOwnProperty.call(body, 'repeat_days')
  const hasRepeatMonths = Object.prototype.hasOwnProperty.call(body, 'repeat_months')
  const hasRecurUntil = Object.prototype.hasOwnProperty.call(body, 'recur_until')

  try {
    // Validate event recurrence presets when the row is (or is becoming) an
    // event. We look at the current row to know its type.
    if (hasRepeatDays || hasRepeatMonths || hasRecurUntil) {
      const cur = await query<TodoRow>(
        `SELECT type, repeat_days, repeat_months, due_date FROM todos
         WHERE id = $1 AND user_id = $2`,
        [req.params.id, userId]
      )
      if (cur.rowCount === 0) return res.status(404).json({ error: 'Not found' })
      const row = cur.rows[0]
      if (row.type === 'event') {
        const nextDays = hasRepeatDays ? Number(body.repeat_days) || 0 : Number(row.repeat_days)
        const nextMonths = hasRepeatMonths ? Number(body.repeat_months) || 0 : Number(row.repeat_months)
        if (!isValidEventRecurrence(nextDays, nextMonths)) {
          return res.status(400).json({ error: 'invalid_event_recurrence' })
        }
        const nextDue = due_date != null ? Number(due_date) : (row.due_date != null ? Number(row.due_date) : null)
        const nextUntil = hasRecurUntil ? (body.recur_until ?? null) : null
        if (nextUntil != null && nextDue != null && Number(nextUntil) <= nextDue) {
          return res.status(400).json({ error: 'recur_until must be after due_date' })
        }
      }
    }

    const result = await query(
      `UPDATE todos SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         priority = COALESCE($4, priority),
         due_date = $5,
         url = COALESCE($6, url),
         repeat_days   = CASE WHEN $9::BOOLEAN THEN $7  ELSE repeat_days   END,
         repeat_months = CASE WHEN $10::BOOLEAN THEN $8 ELSE repeat_months END,
         recur_until   = CASE WHEN $11::BOOLEAN THEN $12 ELSE recur_until  END
       WHERE id = $13 AND user_id = $14`,
      [
        title,
        description,
        category,
        priority,
        due_date ?? null,
        url ?? null,
        hasRepeatDays ? Number(body.repeat_days) || 0 : 0,
        hasRepeatMonths ? Number(body.repeat_months) || 0 : 0,
        hasRepeatDays,
        hasRepeatMonths,
        hasRecurUntil,
        hasRecurUntil ? (body.recur_until ?? null) : null,
        req.params.id,
        userId,
      ]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/todos/:id
router.delete('/:id', async (req, res) => {
  const userId = req.userId!
  try {
    const result = await query(
      'DELETE FROM todos WHERE id = $1 AND user_id = $2',
      [req.params.id, userId]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/todos/:id/complete
router.post('/:id/complete', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    await query(
      `UPDATE todos SET status = 1, completed_at = NOW()
       WHERE id = $1 AND list_name = $2 AND user_id = $3`,
      [req.params.id, list, userId]
    )
    await spawnRepeatingTodos(userId, list)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/todos/:id/uncomplete
router.post('/:id/uncomplete', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  try {
    await query(
      `UPDATE todos SET status = 0, completed_at = NULL
       WHERE id = $1 AND list_name = $2 AND user_id = $3`,
      [req.params.id, list, userId]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/todos/:id/move
router.post('/:id/move', async (req, res) => {
  const userId = req.userId!
  const { target_list, target_category } = req.body as {
    target_list: string
    target_category?: string
  }
  if (!target_list) return res.status(400).json({ error: 'target_list is required' })
  try {
    if (req.plan === 'free' && !(await userHasList(userId, target_list))) {
      if ((await countUserLists(userId)) >= LIMITS.maxLists) {
        return res.status(403).json({ error: 'free_tier_list_limit', limit: LIMITS.maxLists })
      }
    }

    const cat = (target_category ?? '').trim()
    const result = cat
      ? await query(
          'UPDATE todos SET list_name = $1, category = $2 WHERE id = $3 AND user_id = $4',
          [target_list, cat, req.params.id, userId]
        )
      : await query(
          'UPDATE todos SET list_name = $1 WHERE id = $2 AND user_id = $3',
          [target_list, req.params.id, userId]
        )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/todos/:id/snooze
router.post('/:id/snooze', async (req, res) => {
  const userId = req.userId!
  const { snoozed_until, due_date } = req.body as {
    snoozed_until: number | null
    due_date?: number | null
  }
  if (snoozed_until !== null && (typeof snoozed_until !== 'number' || !Number.isFinite(snoozed_until))) {
    return res.status(400).json({ error: 'snoozed_until must be a number or null' })
  }
  try {
    const hasDue = Object.prototype.hasOwnProperty.call(req.body, 'due_date')
    const result = hasDue
      ? await query(
          `UPDATE todos SET snoozed_until = $1, due_date = $2
           WHERE id = $3 AND user_id = $4`,
          [snoozed_until, due_date ?? null, req.params.id, userId]
        )
      : await query(
          `UPDATE todos SET snoozed_until = $1
           WHERE id = $2 AND user_id = $3`,
          [snoozed_until, req.params.id, userId]
        )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
