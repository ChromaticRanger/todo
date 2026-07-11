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
  duration_seconds: number | null
  color: string | null
  all_day: boolean
  // Set only on expanded recurring occurrences: the original cadence-generated
  // start, used as the stable key for per-occurrence overrides. Not a column.
  occurrence_start?: number
}

// Fixed palette for per-item calendar colours. Keys map to CSS tokens
// (--evt-<key>) on the client (see src/lib/eventColor.ts). NULL means
// "default / theme accent". Kept in sync with EVENT_COLORS on the client.
export const COLOR_KEYS = [
  'rose', 'amber', 'emerald', 'sky', 'violet', 'fuchsia', 'teal', 'orange',
] as const

function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return (COLOR_KEYS as readonly string[]).includes(value) ? value : null
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
    duration_seconds: row.duration_seconds != null ? Number(row.duration_seconds) : null,
    color: row.color ?? null,
    all_day: !!row.all_day,
    occurrence_start: row.occurrence_start != null ? Number(row.occurrence_start) : null,
  }
}

// Spawn-on-completion model for recurring TODOS only. Events use virtual
// expansion at read time (see `expandEventOccurrences` below) because they
// never get completed — there's no natural trigger to spawn the next row.
// Spawns the next occurrence for any completed-but-not-yet-spawned repeating
// todos. Scoped to `listName` by default; pass `undefined` to spawn across
// every list the user owns (used by the cross-list "All Lists" windowed views,
// so a repeating todo in any list surfaces its next occurrence).
async function spawnRepeatingTodos(userId: string, listName?: string) {
  const params: unknown[] = [userId]
  let listFilter = ''
  if (listName !== undefined) {
    params.push(listName)
    listFilter = 'AND list_name = $2'
  }
  const result = await query<TodoRow>(
    `SELECT * FROM todos
     WHERE user_id = $1
       ${listFilter}
       AND status = 1
       AND spawned_next = 0
       AND type = 'todo'
       AND (repeat_days > 0 OR repeat_months > 0)`,
    params
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
        todo.list_name,
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

export interface OccurrenceOverride {
  due: number | null
  dur: number | null
}

export function expandEventOccurrences(
  series: TodoRow[],
  from: number,
  to: number,
  overrides?: Map<string, OccurrenceOverride>
): TodoRow[] {
  const out: TodoRow[] = []
  for (const ev of series) {
    const stepDays = Number(ev.repeat_days)
    const stepMonths = Number(ev.repeat_months)
    const isRecurring = stepDays > 0 || stepMonths > 0
    const base = ev.due_date != null ? Number(ev.due_date) : null
    if (base == null) continue
    // Each occurrence inherits the series' duration. Treat NULL/0 the same
    // (legacy point-in-time) so the overlap check below collapses to
    // start-in-window for them.
    const dur = ev.duration_seconds != null ? Number(ev.duration_seconds) : 0

    if (!isRecurring) {
      // Overlap: include when [base, base+dur) touches [from, to).
      if (base < to && base + dur > from) out.push(ev)
      continue
    }

    const until = ev.recur_until != null ? Number(ev.recur_until) : Infinity
    let occ = base

    // Fast-forward to the first occurrence whose end is past `from` — that's
    // the first one that can overlap the window. For dur=0 this is the same
    // as the classic "first occurrence >= from".
    if (occ + dur <= from) {
      if (stepDays > 0) {
        const stepSec = stepDays * 86400
        const target = from - dur
        const skips = Math.floor((target - occ) / stepSec)
        occ += Math.max(0, skips) * stepSec
        while (occ + dur <= from) occ += stepSec
      } else {
        // Monthly: iterate so JS setMonth handles 31st → 28th/29th/30th
        // boundaries and Feb 29 yearly anchors correctly.
        while (occ + dur <= from) occ = addMonths(occ, stepMonths)
      }
    }

    let safety = 0
    while (occ < to && occ <= until && safety++ < MAX_OCCURRENCES_PER_SERIES) {
      // Apply a per-occurrence override (keyed on the ORIGINAL start) if one
      // exists, then only emit when the final [start, end) still overlaps the
      // window. `occurrence_start` carries the original key back to the client.
      const ov = overrides?.get(`${Number(ev.id)}:${occ}`)
      const finalDue = ov && ov.due != null ? ov.due : occ
      const finalDur = ov && ov.dur != null ? ov.dur : dur
      if (finalDue < to && finalDue + finalDur > from) {
        out.push({
          ...ev,
          due_date: finalDue,
          duration_seconds: finalDur > 0 ? finalDur : ev.duration_seconds,
          occurrence_start: occ,
        })
      }
      if (stepDays > 0) occ += stepDays * 86400
      else occ = addMonths(occ, stepMonths)
    }
  }
  return out
}

// Loads the user's recurring event series that could produce an occurrence in
// [from, to] and returns the expanded virtual rows. Cheap: the partial index
// `todos_event_series_idx` keeps the lookup small.
export async function fetchExpandedEventSeries(
  userId: string,
  from: number,
  to: number
): Promise<TodoRow[]> {
  const result = await query<TodoRow>(
    buildTodoSelect(
      // recur_until is the LAST allowed start; the last occurrence ends at
      // recur_until + duration_seconds, which still has to reach `from` for
      // the series to be relevant.
      `WHERE user_id = $1 AND status = 0 AND type = 'event'
       AND (repeat_days > 0 OR repeat_months > 0)
       AND due_date IS NOT NULL
       AND due_date < $3
       AND (recur_until IS NULL
            OR (recur_until + COALESCE(duration_seconds, 0)) >= $2)`
    ),
    [userId, from, to]
  )
  // Load per-occurrence overrides for the fetched series so expansion can apply
  // "this occurrence" edits.
  let overrides: Map<string, OccurrenceOverride> | undefined
  const seriesIds = result.rows.map((r) => Number(r.id))
  if (seriesIds.length > 0) {
    const ov = await query<{
      series_id: string; occurrence_start: string
      new_due_date: string | null; new_duration_seconds: string | null
    }>(
      `SELECT series_id, occurrence_start, new_due_date, new_duration_seconds
       FROM event_overrides WHERE user_id = $1 AND series_id = ANY($2::bigint[])`,
      [userId, seriesIds]
    )
    overrides = new Map()
    for (const r of ov.rows) {
      overrides.set(`${Number(r.series_id)}:${Number(r.occurrence_start)}`, {
        due: r.new_due_date != null ? Number(r.new_due_date) : null,
        dur: r.new_duration_seconds != null ? Number(r.new_duration_seconds) : null,
      })
    }
  }
  return expandEventOccurrences(result.rows, from, to, overrides)
}

export function buildTodoSelect(extra = ''): string {
  return `SELECT id, list_name, title, description, category, priority, status,
    EXTRACT(EPOCH FROM created_at)::BIGINT AS created_at,
    EXTRACT(EPOCH FROM completed_at)::BIGINT AS completed_at,
    due_date, repeat_days, repeat_months, spawned_next, type, url, snoozed_until,
    recur_until, duration_seconds, color, all_day
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
    // (today/week/month) intentionally still surface them so an
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

// Shared helper for the today/week/month routes: fetch the regular rows from
// the time-windowed scope and merge expanded recurring-event occurrences.
//
// Todos use start-in-window filtering. Events use overlap filtering so a
// multi-day block appears in every window it touches. Events always span every
// list (they live outside any list); `allLists` controls only the todo branch —
// when true the `list_name = $2` restriction is dropped so todos due in the
// window surface regardless of which list they belong to.
async function fetchWindowedScope(
  userId: string,
  list: string,
  from: number,
  to: number,
  allLists: boolean
) {
  // Placeholders shift because the all-lists query drops the `list` param: the
  // window bounds are $2/$3 when there's no list filter, $3/$4 otherwise.
  const [scope, params] = allLists
    ? [
        `(type = 'todo' AND due_date >= $2 AND due_date < $3)
         OR (type = 'event' AND repeat_days = 0 AND repeat_months = 0
             AND due_date < $3
             AND (due_date + COALESCE(duration_seconds, 0)) > $2)`,
        [userId, from, to],
      ]
    : [
        `(list_name = $2 AND type = 'todo' AND due_date >= $3 AND due_date < $4)
         OR (type = 'event' AND repeat_days = 0 AND repeat_months = 0
             AND due_date < $4
             AND (due_date + COALESCE(duration_seconds, 0)) > $3)`,
        [userId, list, from, to],
      ]
  const [main, series] = await Promise.all([
    query<TodoRow>(
      buildTodoSelect(
        `WHERE user_id = $1 AND status = 0
         AND due_date IS NOT NULL
         AND (${scope})
         ORDER BY due_date ASC`
      ),
      params as unknown[]
    ),
    fetchExpandedEventSeries(userId, from, to),
  ])
  const merged = [...main.rows, ...series].map(coerceTodo)
  merged.sort((a, b) => (a.due_date ?? 0) - (b.due_date ?? 0))
  return merged
}

// Shared parse for the `?all=1` scope flag on the windowed routes.
function wantsAllLists(req: { query: Record<string, unknown> }): boolean {
  return req.query.all === '1' || req.query.all === 'true'
}

// GET /api/todos/today?list=X&all=1
// With all=1 the scope spans every list (todos from all lists, not just `list`).
router.get('/today', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  const allLists = wantsAllLists(req)
  try {
    await spawnRepeatingTodos(userId, allLists ? undefined : list)
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    res.json({ todos: await fetchWindowedScope(userId, list, dayStart, dayStart + 86400, allLists) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/today/all?includeOverdue=1
// Cross-list "due today" feed for the login reminder modal. Unlike /today it
// spans every list the user owns (no list filter) and, unlike /calendar, it's
// not Pro-gated — free users still get their dated todos. Events (one-off and
// expanded recurring series) are merged in just like the windowed views.
// With includeOverdue, pre-today overdue todos (due_date < today's start) are
// added too; events are never "overdue" (matching the /overdue route).
router.get('/today/all', async (req, res) => {
  const userId = req.userId!
  const includeOverdue = req.query.includeOverdue === '1' || req.query.includeOverdue === 'true'
  try {
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    const to = dayStart + 86400
    // Overdue todos are strictly before today's start, so they never overlap
    // the [dayStart, to) today window — no dedup needed.
    const overdueClause = includeOverdue
      ? `OR (type = 'todo' AND due_date < $2)`
      : ''
    const [main, series] = await Promise.all([
      query<TodoRow>(
        buildTodoSelect(
          // Todos: start-in-window across all lists. Events: overlap with the
          // day so a multi-day block that touches today still shows.
          `WHERE user_id = $1 AND status = 0
           AND due_date IS NOT NULL
           AND (
             (type = 'todo' AND due_date >= $2 AND due_date < $3)
             OR (type = 'event' AND repeat_days = 0 AND repeat_months = 0
                 AND due_date < $3
                 AND (due_date + COALESCE(duration_seconds, 0)) > $2)
             ${overdueClause}
           )
           ORDER BY due_date ASC`
        ),
        [userId, dayStart, to]
      ),
      fetchExpandedEventSeries(userId, dayStart, to),
    ])
    const merged = [...main.rows, ...series].map(coerceTodo)
    merged.sort((a, b) => (a.due_date ?? 0) - (b.due_date ?? 0))
    res.json({ todos: merged })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/week?list=X&all=1
router.get('/week', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  const allLists = wantsAllLists(req)
  try {
    await spawnRepeatingTodos(userId, allLists ? undefined : list)
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    res.json({ todos: await fetchWindowedScope(userId, list, dayStart, dayStart + 7 * 86400, allLists) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/month?list=X&all=1
router.get('/month', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  const allLists = wantsAllLists(req)
  try {
    await spawnRepeatingTodos(userId, allLists ? undefined : list)
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    res.json({ todos: await fetchWindowedScope(userId, list, dayStart, dayStart + 30 * 86400, allLists) })
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
          // Todos: start-in-window. Events: overlap with window so multi-day
          // blocks show up on every day they span.
          `WHERE user_id = $1 AND status = 0
           AND due_date IS NOT NULL
           AND (
             (type = 'todo' AND due_date >= $2 AND due_date < $3)
             OR (type = 'event' AND repeat_days = 0 AND repeat_months = 0
                 AND due_date < $3
                 AND (due_date + COALESCE(duration_seconds, 0)) > $2)
           )
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
    // contributes to today/week/month at most once each. Events never count
    // toward Overdue — a past event has taken place, it isn't actionable.
    const [countsResult, seriesMonth] = await Promise.all([
      query<{ today: string; week: string; month: string; overdue: string }>(
        // Per-window FILTER branches on type so events use overlap semantics
        // (a multi-day event counts toward every window it touches) while
        // todos keep start-in-window semantics. The outer WHERE is the loose
        // candidate set; FILTER does the real per-window check.
        `WITH bounds AS (
           SELECT
             (FLOOR(EXTRACT(EPOCH FROM NOW()) / 86400) * 86400)::BIGINT AS day_start,
             EXTRACT(EPOCH FROM NOW())::BIGINT AS now_epoch
         )
         SELECT
           COUNT(*) FILTER (
             WHERE (type = 'todo' AND due_date >= b.day_start AND due_date < b.day_start + 86400)
                OR (type = 'event' AND due_date < b.day_start + 86400
                    AND (due_date + COALESCE(duration_seconds, 0)) > b.day_start)
           ) AS today,
           COUNT(*) FILTER (
             WHERE (type = 'todo' AND due_date >= b.day_start AND due_date < b.day_start + 7 * 86400)
                OR (type = 'event' AND due_date < b.day_start + 7 * 86400
                    AND (due_date + COALESCE(duration_seconds, 0)) > b.day_start)
           ) AS week,
           COUNT(*) FILTER (
             WHERE (type = 'todo' AND due_date >= b.day_start AND due_date < b.day_start + 30 * 86400)
                OR (type = 'event' AND due_date < b.day_start + 30 * 86400
                    AND (due_date + COALESCE(duration_seconds, 0)) > b.day_start)
           ) AS month,
           COUNT(*) FILTER (WHERE due_date < b.now_epoch AND type = 'todo') AS overdue
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
    // Bucket expanded recurring-event occurrences into the three windows
    // using overlap semantics — a block that touches a window counts once.
    const now = Math.floor(Date.now() / 1000)
    const dayStart = Math.floor(now / 86400) * 86400
    let extraToday = 0, extraWeek = 0, extraMonth = 0
    for (const ev of seriesMonth) {
      const start = ev.due_date != null ? Number(ev.due_date) : 0
      const dur = ev.duration_seconds != null ? Number(ev.duration_seconds) : 0
      const end = start + dur
      if (start < dayStart + 86400 && end > dayStart) extraToday++
      if (start < dayStart + 7 * 86400 && end > dayStart) extraWeek++
      if (start < dayStart + 30 * 86400 && end > dayStart) extraMonth++
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

// GET /api/todos/overdue?list=X&all=1
// Events are intentionally excluded — once an event's date passes it has
// simply taken place, it is not "overdue" in the actionable sense.
// With all=1 the scope spans every list, not just `list`.
router.get('/overdue', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'
  const allLists = wantsAllLists(req)
  try {
    await spawnRepeatingTodos(userId, allLists ? undefined : list)
    const [listFilter, params] = allLists
      ? ['', [userId]]
      : ['AND list_name = $2', [userId, list]]
    const result = await query<TodoRow>(
      buildTodoSelect(
        `WHERE user_id = $1 AND status = 0
         ${listFilter} AND type = 'todo'
         AND due_date IS NOT NULL
         AND due_date < EXTRACT(EPOCH FROM NOW())::BIGINT
         ORDER BY due_date ASC`
      ),
      params as unknown[]
    )
    res.json({ todos: result.rows.map(coerceTodo) })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// GET /api/todos/completed?list=X&window=30d&limit=N
// Also accepts legacy `since=epoch` for the browser extension.
//
// `window` is the user-friendly knob: '7d' | '30d' | '90d' | '1y' | 'all'.
// `since` (if provided) takes precedence so existing callers keep working.
// `limit` caps the response (default 500, hard ceiling 2000) so an 'all'
// query on a heavy user can't return tens of thousands of rows.
// `hasMore` in the response signals when the cap clipped the result.
// `total` is the exact count of rows in the window (independent of limit),
// so the UI can show "X completed in the last 30 days" even when clipped.
const COMPLETED_WINDOWS: Record<string, number | null> = {
  '7d': 7 * 86400,
  '30d': 30 * 86400,
  '90d': 90 * 86400,
  '1y': 365 * 86400,
  all: null,
}
const COMPLETED_LIMIT_DEFAULT = 500
const COMPLETED_LIMIT_MAX = 2000
router.get('/completed', async (req, res) => {
  const userId = req.userId!
  const list = (req.query.list as string) || 'todos'

  let since = 0
  if (req.query.since != null) {
    since = parseInt(req.query.since as string) || 0
  } else if (req.query.window != null) {
    const span = COMPLETED_WINDOWS[String(req.query.window)]
    if (span === undefined) {
      return res.status(400).json({ error: 'Invalid window' })
    }
    since = span == null ? 0 : Math.floor(Date.now() / 1000) - span
  }

  const requested = req.query.limit ? parseInt(req.query.limit as string) : COMPLETED_LIMIT_DEFAULT
  const limit = Math.min(Math.max(1, requested || COMPLETED_LIMIT_DEFAULT), COMPLETED_LIMIT_MAX)

  try {
    // Rows + exact total in parallel. limit+1 on the row fetch lets us flag
    // `hasMore` without a second query; the total is cheap with the partial
    // index added in migration 024.
    const [rowsRes, countRes] = await Promise.all([
      query<TodoRow>(
        buildTodoSelect(
          `WHERE user_id = $1 AND list_name = $2 AND status = 1 AND type = 'todo'
           AND (EXTRACT(EPOCH FROM completed_at)::BIGINT >= $3 OR $3 = 0)
           ORDER BY completed_at DESC
           LIMIT $4`
        ),
        [userId, list, since, limit + 1]
      ),
      query<{ total: string }>(
        `SELECT COUNT(*)::TEXT AS total FROM todos
         WHERE user_id = $1 AND list_name = $2 AND status = 1 AND type = 'todo'
           AND (EXTRACT(EPOCH FROM completed_at)::BIGINT >= $3 OR $3 = 0)`,
        [userId, list, since]
      ),
    ])
    const hasMore = rowsRes.rows.length > limit
    const rows = hasMore ? rowsRes.rows.slice(0, limit) : rowsRes.rows
    const total = Number(countRes.rows[0]?.total ?? 0)
    res.json({ todos: rows.map(coerceTodo), hasMore, total })
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
    duration_seconds = null,
    color = null,
    all_day = false,
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
    duration_seconds: number | null
    color: string | null
    all_day: boolean
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
  // duration_seconds is event-only and bounded; reject anything outside the
  // accepted range up front so DB never sees a bogus value.
  if (duration_seconds != null) {
    const d = Number(duration_seconds)
    if (!Number.isInteger(d) || d < 0 || d > 14 * 86400) {
      return res.status(400).json({ error: 'invalid_duration_seconds' })
    }
    if (d > 0 && type !== 'event') {
      return res.status(400).json({ error: 'duration_seconds_event_only' })
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
  // duration_seconds is event-only too. Treat 0 as NULL (no real "instant"
  // events; the column is for time blocks). Validated above.
  const effectiveDuration =
    type === 'event' && duration_seconds != null && Number(duration_seconds) > 0
      ? Number(duration_seconds)
      : null
  const effectiveColor = normalizeColor(color)
  // all_day is event-only; ignore it on other types.
  const effectiveAllDay = type === 'event' ? !!all_day : false

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
          due_date, repeat_days, repeat_months, spawned_next, type, url, recur_until, duration_seconds, color, all_day)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,0,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [userId, effectiveList, title, description, effectiveCategory, priority, effectiveDue, effectiveRepeatDays, effectiveRepeatMonths, type, effectiveUrl, effectiveRecurUntil, effectiveDuration, effectiveColor, effectiveAllDay]
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
    duration_seconds: number | null
    color: string | null
    all_day: boolean
    snoozed_until: number | null
  }>
  const { title, description, category, priority, due_date, url } = body

  // Detect whether the client sent each recurrence field so we can distinguish
  // "leave unchanged" (undefined) from "clear" (null / 0).
  const hasRepeatDays = Object.prototype.hasOwnProperty.call(body, 'repeat_days')
  const hasRepeatMonths = Object.prototype.hasOwnProperty.call(body, 'repeat_months')
  const hasRecurUntil = Object.prototype.hasOwnProperty.call(body, 'recur_until')
  const hasDuration = Object.prototype.hasOwnProperty.call(body, 'duration_seconds')
  const hasColor = Object.prototype.hasOwnProperty.call(body, 'color')
  const hasAllDay = Object.prototype.hasOwnProperty.call(body, 'all_day')
  const hasSnoozed = Object.prototype.hasOwnProperty.call(body, 'snoozed_until')
  if (hasSnoozed && body.snoozed_until !== null &&
      (typeof body.snoozed_until !== 'number' || !Number.isFinite(body.snoozed_until))) {
    return res.status(400).json({ error: 'snoozed_until must be a number or null' })
  }

  try {
    // Validate event recurrence presets when the row is (or is becoming) an
    // event. We look at the current row to know its type.
    if (hasRepeatDays || hasRepeatMonths || hasRecurUntil || hasDuration) {
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
      // duration_seconds is event-only and bounded.
      if (hasDuration && body.duration_seconds != null) {
        const d = Number(body.duration_seconds)
        if (!Number.isInteger(d) || d < 0 || d > 14 * 86400) {
          return res.status(400).json({ error: 'invalid_duration_seconds' })
        }
        if (d > 0 && row.type !== 'event') {
          return res.status(400).json({ error: 'duration_seconds_event_only' })
        }
      }
    }

    // Treat 0/missing as NULL on writes — only positive durations are stored.
    const nextDuration = hasDuration && body.duration_seconds != null && Number(body.duration_seconds) > 0
      ? Number(body.duration_seconds)
      : null
    const result = await query(
      `UPDATE todos SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         category = COALESCE($3, category),
         priority = COALESCE($4, priority),
         due_date = $5,
         url = COALESCE($6, url),
         repeat_days     = CASE WHEN $9::BOOLEAN  THEN $7  ELSE repeat_days     END,
         repeat_months   = CASE WHEN $10::BOOLEAN THEN $8  ELSE repeat_months   END,
         recur_until     = CASE WHEN $11::BOOLEAN THEN $12 ELSE recur_until     END,
         duration_seconds = CASE WHEN $15::BOOLEAN THEN $16 ELSE duration_seconds END,
         color           = CASE WHEN $17::BOOLEAN THEN $18 ELSE color           END,
         all_day         = CASE WHEN $19::BOOLEAN THEN $20 ELSE all_day         END,
         snoozed_until   = CASE WHEN $21::BOOLEAN THEN $22 ELSE snoozed_until   END
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
        hasDuration,
        nextDuration,
        hasColor,
        hasColor ? normalizeColor(body.color) : null,
        hasAllDay,
        hasAllDay ? !!body.all_day : false,
        hasSnoozed,
        hasSnoozed ? (body.snoozed_until ?? null) : null,
      ]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    // A base edit is a whole-series change ("all occurrences"); drop any
    // per-occurrence overrides so exceptions don't linger against a shifted
    // series. No-op for non-recurring rows.
    await query(
      `DELETE FROM event_overrides o USING todos t
       WHERE o.series_id = t.id AND t.id = $1 AND o.user_id = $2
         AND t.type = 'event' AND (t.repeat_days > 0 OR t.repeat_months > 0)`,
      [req.params.id, userId]
    )
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
    // Clear any per-occurrence overrides for a deleted recurring series.
    await query(
      'DELETE FROM event_overrides WHERE series_id = $1 AND user_id = $2',
      [req.params.id, userId]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/todos/:id/occurrence — move/resize a SINGLE occurrence of a
// recurring event ("this occurrence") by upserting an override keyed on the
// original occurrence start. "All occurrences" uses the base PUT above.
router.put('/:id/occurrence', async (req, res) => {
  const userId = req.userId!
  const seriesId = req.params.id
  const { occurrence_start, due_date, duration_seconds = null } = req.body as Partial<{
    occurrence_start: number
    due_date: number | null
    duration_seconds: number | null
  }>

  if (occurrence_start == null || !Number.isInteger(Number(occurrence_start))) {
    return res.status(400).json({ error: 'occurrence_start is required' })
  }
  if (due_date == null || !Number.isInteger(Number(due_date))) {
    return res.status(400).json({ error: 'due_date is required' })
  }
  if (duration_seconds != null) {
    const d = Number(duration_seconds)
    if (!Number.isInteger(d) || d < 0 || d > 14 * 86400) {
      return res.status(400).json({ error: 'invalid_duration_seconds' })
    }
  }

  try {
    // The series must exist, belong to the user, and be an event.
    const cur = await query<{ type: string }>(
      'SELECT type FROM todos WHERE id = $1 AND user_id = $2',
      [seriesId, userId]
    )
    if (cur.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    if (cur.rows[0].type !== 'event') {
      return res.status(400).json({ error: 'not_an_event' })
    }

    const nextDur = duration_seconds != null && Number(duration_seconds) > 0
      ? Number(duration_seconds)
      : null
    await query(
      `INSERT INTO event_overrides
         (user_id, series_id, occurrence_start, new_due_date, new_duration_seconds)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (series_id, occurrence_start)
       DO UPDATE SET new_due_date = $4, new_duration_seconds = $5`,
      [userId, seriesId, Number(occurrence_start), Number(due_date), nextDur]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PUT /api/todos/:id/series-shift — move/resize a WHOLE recurring series ("all
// occurrences") by shifting its anchor by `delta_seconds` and setting an
// absolute duration. Clears per-occurrence overrides since the base moved.
router.put('/:id/series-shift', async (req, res) => {
  const userId = req.userId!
  const seriesId = req.params.id
  const { delta_seconds = 0, duration_seconds = null } = req.body as Partial<{
    delta_seconds: number
    duration_seconds: number | null
  }>
  const delta = Number(delta_seconds)
  if (!Number.isInteger(delta)) {
    return res.status(400).json({ error: 'invalid_delta_seconds' })
  }
  if (duration_seconds != null) {
    const d = Number(duration_seconds)
    if (!Number.isInteger(d) || d < 0 || d > 14 * 86400) {
      return res.status(400).json({ error: 'invalid_duration_seconds' })
    }
  }
  const nextDur = duration_seconds != null && Number(duration_seconds) > 0
    ? Number(duration_seconds)
    : null
  try {
    const result = await query(
      `UPDATE todos
         SET due_date = due_date + $1,
             duration_seconds = $2
       WHERE id = $3 AND user_id = $4 AND type = 'event'`,
      [delta, nextDur, seriesId, userId]
    )
    if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' })
    await query(
      'DELETE FROM event_overrides WHERE series_id = $1 AND user_id = $2',
      [seriesId, userId]
    )
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
