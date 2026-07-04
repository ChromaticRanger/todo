<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { Todo, TodoFormData } from '../types/todo'
import { apiFetch } from '../lib/api'
import { useTodoStore } from '../stores/todoStore'
import { useListStore } from '../stores/listStore'
import { useSettingsStore } from '../stores/settingsStore'
import { priorityBorderClass } from '../lib/priorityClass'
import { describeRecurrence } from '../lib/recurrence'
import { formatEventTimeRange, eventEnd } from '../lib/eventTime'
import { colorVar } from '../lib/eventColor'
import { useCalendarDrag, type DragMode } from '../composables/useCalendarDrag'
import TodoForm from './TodoForm.vue'

const todoStore = useTodoStore()
const listStore = useListStore()
const settingsStore = useSettingsStore()

const today = new Date()
// Single anchor Date for the visible range. For month mode it's the 1st of the
// shown month; for week mode it's the Monday of the shown week. Initialise
// based on the persisted view mode so a reload lands on the current bucket.
const viewAnchor = ref<Date>(
  settingsStore.calendarView === 'week'
    ? startOfWeek(today)
    : new Date(today.getFullYear(), today.getMonth(), 1)
)

const todos = ref<Todo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const openDayKey = ref<string | null>(null)
const editing = ref<Todo | null>(null)
const editingCategories = ref<string[]>([])

// Right-click context menu + new-event creation state.
const dayMenu = ref<{ x: number; y: number; date: Date } | null>(null)
const creatingDue = ref<number | null>(null)
const creatingCategories = ref<string[]>([])

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const PALETTE = [
  'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500',
  'bg-violet-500', 'bg-fuchsia-500', 'bg-teal-500', 'bg-orange-500',
] as const

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return h >>> 0
}

function listColour(name: string): string {
  return PALETTE[hashStr(name) % PALETTE.length]
}

// Local-day key so a calendar cell groups todos by the user's clock, not UTC.
function localDayKey(input: Date | number): string {
  const d = input instanceof Date ? input : new Date(input * 1000)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function isSameDay(a: Date, b: Date): boolean {
  return localDayKey(a) === localDayKey(b)
}

function startOfDayEpoch(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.floor(x.getTime() / 1000)
}

// ── Week hour-grid constants & helpers ─────────────────────────────────────
const HOUR_PX = 56
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const ALLDAY_BAR_PX = 22
const hourGridScroll = ref<HTMLElement | null>(null)

// Monday containing the given date (or earlier in the same week).
function startOfWeek(d: Date): Date {
  const dow = (d.getDay() + 6) % 7 // Mon=0..Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

// Mon-start 7-cell week grid. All cells flagged inMonth=true so any existing
// "non-current-month" styling collapses to a no-op (week mode doesn't have a
// notion of "out of bucket" — every visible day is a real day).
function buildWeekGrid(anchor: Date): { date: Date; inMonth: boolean }[] {
  const monday = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => ({ date: addDays(monday, i), inMonth: true }))
}

// Mon-start grid, always 6 rows × 7 cols.
function buildMonthGrid(anchor: Date): { date: Date; inMonth: boolean }[] {
  const year = anchor.getFullYear()
  const month = anchor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  // JS getDay: Sun=0..Sat=6. Convert to Mon=0..Sun=6.
  const dow = (firstOfMonth.getDay() + 6) % 7
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - dow + i)
    cells.push({ date, inMonth: date.getMonth() === month })
  }
  return cells
}

const grid = computed(() =>
  settingsStore.calendarView === 'week'
    ? buildWeekGrid(viewAnchor.value)
    : buildMonthGrid(viewAnchor.value)
)

const emptyPreposition = computed(() => settingsStore.calendarView === 'week' ? 'for' : 'in')

const monthLabel = computed(() => {
  if (settingsStore.calendarView === 'week') {
    const start = startOfWeek(viewAnchor.value)
    const end = addDays(start, 6)
    const sameYear = start.getFullYear() === end.getFullYear()
    const sameMonth = sameYear && start.getMonth() === end.getMonth()
    const startStr = start.toLocaleDateString(undefined,
      sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })
    const endStr = end.toLocaleDateString(undefined,
      sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
    const yearStr = sameYear ? `, ${start.getFullYear()}` : ''
    return `${startStr} – ${endStr}${yearStr}`
  }
  return viewAnchor.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})

const todosByDay = computed(() => {
  const map = new Map<string, Todo[]>()
  const push = (key: string, t: Todo) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
  }
  for (const t of todos.value) {
    if (t.due_date == null) continue
    // Multi-day events (positive duration) appear on every day they span.
    // Todos and point-in-time events stay grouped by their start day.
    if (t.type === 'event' && t.duration_seconds != null && t.duration_seconds > 0) {
      const start = new Date(t.due_date * 1000)
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endEpoch = t.due_date + t.duration_seconds
      let cursor = startDay
      while (cursor.getTime() / 1000 < endEpoch) {
        push(localDayKey(cursor), t)
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
      }
    } else {
      push(localDayKey(t.due_date), t)
    }
  }
  return map
})

// Days that actually fall in the displayed month, used by the mobile agenda
// (Mon-start, may bleed slightly but agenda hides empty cells anyway).
const agendaDays = computed(() =>
  grid.value
    .filter((c) => c.inMonth)
    .map((c) => ({ date: c.date, items: todosByDay.value.get(localDayKey(c.date)) ?? [] }))
    .filter((d) => d.items.length > 0)
)

// ── Week hour-grid: positioned event blocks per day ────────────────────────
//
// For each day column, find events that overlap the day, clip [start, end] to
// the day's bounds, and lane-pack overlapping events side by side. Multi-day
// events split into one block per day they touch.
interface HourBlock {
  key: string
  todo: Todo
  topPx: number
  heightPx: number
  leftPct: number
  widthPct: number
  startEpoch: number
  endEpoch: number
}

function dayStartEpoch(d: Date): number {
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 1000)
}

function packLanes(blocks: HourBlock[]): HourBlock[] {
  // Sort by start, then by end descending so longer-running events anchor lanes.
  const sorted = [...blocks].sort((a, b) =>
    a.startEpoch - b.startEpoch || b.endEpoch - a.endEpoch
  )
  // Greedy lane assignment within an overlap cluster. A new cluster begins
  // whenever no current event is still running at the next event's start.
  const lanes: number[] = [] // lane index → end epoch
  const cluster: HourBlock[] = []
  let clusterMaxLane = 0
  const flush = () => {
    if (!cluster.length) return
    const laneCount = clusterMaxLane + 1
    const width = 100 / laneCount
    for (const b of cluster) {
      // assigned lane was stored on b.leftPct as a lane index sentinel
      const laneIdx = b.leftPct
      b.leftPct = laneIdx * width
      b.widthPct = width
    }
    cluster.length = 0
    lanes.length = 0
    clusterMaxLane = 0
  }
  for (const b of sorted) {
    // Drop lanes whose event has ended before this one starts.
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] <= b.startEpoch) lanes[i] = -1
    }
    const allFree = lanes.every((l) => l === -1)
    if (allFree) flush()
    // Pick the lowest free lane (-1 means free, including newly-vacated).
    let lane = lanes.findIndex((l) => l === -1)
    if (lane === -1) {
      lane = lanes.length
      lanes.push(b.endEpoch)
    } else {
      lanes[lane] = b.endEpoch
    }
    b.leftPct = lane // sentinel — converted to % in flush()
    if (lane > clusterMaxLane) clusterMaxLane = lane
    cluster.push(b)
  }
  flush()
  return sorted
}

const weekDayBlocks = computed(() => {
  if (settingsStore.calendarView !== 'week') return new Map<string, HourBlock[]>()
  const map = new Map<string, HourBlock[]>()
  for (const cell of grid.value) {
    const dayStart = dayStartEpoch(cell.date)
    const dayEnd = dayStart + 86400
    const blocks: HourBlock[] = []
    for (const t of todos.value) {
      if (t.due_date == null) continue
      // All-day events live in the dedicated lane above the hour grid.
      if (t.all_day) continue
      const dur = t.duration_seconds ?? 0
      const evStart = t.due_date
      const evEnd = t.due_date + dur
      // Skip items that don't touch this day.
      if (evEnd <= dayStart || evStart >= dayEnd) continue
      // Treat point-in-time items (todos / zero-duration events) as a 30-min block so they're visible.
      const visibleStart = Math.max(evStart, dayStart)
      const visibleEndRaw = dur > 0 ? Math.min(evEnd, dayEnd) : Math.min(evStart + 1800, dayEnd)
      const visibleEnd = Math.max(visibleEndRaw, visibleStart + 900) // min 15 min visual
      blocks.push({
        key: `${t.id}-${t.due_date}-${dayStart}`,
        todo: t,
        topPx: ((visibleStart - dayStart) / 3600) * HOUR_PX,
        heightPx: ((visibleEnd - visibleStart) / 3600) * HOUR_PX,
        leftPct: 0, // assigned by packLanes
        widthPct: 100,
        startEpoch: visibleStart,
        endEpoch: visibleEnd,
      })
    }
    map.set(localDayKey(cell.date), packLanes(blocks))
  }
  return map
})

function blocksFor(date: Date): HourBlock[] {
  return weekDayBlocks.value.get(localDayKey(date)) ?? []
}

// ── Week all-day lane ───────────────────────────────────────────────────────
// All-day events render as horizontal bars above the hour grid, spanning the
// day columns they cover (clipped to the visible week) and stacked into rows
// so overlapping bars don't collide.
interface AllDayBar {
  key: string
  todo: Todo
  row: number
  startCol: number
  span: number
}

const weekAllDayBars = computed<{ bars: AllDayBar[]; rows: number }>(() => {
  if (settingsStore.calendarView !== 'week') return { bars: [], rows: 0 }
  const cells = grid.value
  const weekStart = dayStartEpoch(cells[0].date)
  const weekEnd = dayStartEpoch(cells[cells.length - 1].date) + 86400
  const bars: AllDayBar[] = []
  for (const t of todos.value) {
    if (!t.all_day || t.due_date == null) continue
    const evStart = t.due_date
    const evEnd = t.due_date + (t.duration_seconds ?? 86400)
    if (evEnd <= weekStart || evStart >= weekEnd) continue
    const startCol = Math.max(0, Math.floor((evStart - weekStart) / 86400))
    const endColExcl = Math.min(7, Math.ceil((evEnd - weekStart) / 86400))
    bars.push({
      key: `${t.id}-${t.due_date}`,
      todo: t,
      row: 0,
      startCol,
      span: Math.max(1, endColExcl - startCol),
    })
  }
  // Greedy row packing: place each bar in the first row it fits without overlap.
  bars.sort((a, b) => a.startCol - b.startCol || b.span - a.span)
  const rowEnds: number[] = [] // row index → first free column
  for (const bar of bars) {
    let r = rowEnds.findIndex((end) => end <= bar.startCol)
    if (r === -1) { r = rowEnds.length; rowEnds.push(0) }
    rowEnds[r] = bar.startCol + bar.span
    bar.row = r
  }
  return { bars, rows: rowEnds.length }
})

// ── Drag to move / resize ───────────────────────────────────────────────────
// Projection recomputes from the live pointer on every move (never from stored
// deltas), so a drag survives the grid re-rendering under it during edge
// auto-navigation. The ghost overlay is driven entirely by `drag`.
const { isDragging, start: startPointerDrag } = useCalendarDrag()
const hourGridInner = ref<HTMLElement | null>(null)
const monthGridEl = ref<HTMLElement | null>(null)

interface DragState {
  todo: Todo
  mode: DragMode
  grabOffsetMin: number // week move: pointer-minutes − block-start-minutes at grab
  ghost: { dayIndex: number; topPx: number; heightPx: number } | null // week timed overlay
  allDayGhost: { startCol: number; span: number } | null // week all-day lane overlay
  targetDayKey: string | null // month overlay: highlighted cell
  label: string
  pointer: { x: number; y: number }
  result: { due_date: number; duration_seconds: number | null } | null
}
const drag = ref<DragState | null>(null)

function snap15(min: number): number {
  return Math.round(min / 15) * 15
}
function minutesOfDay(epoch: number): number {
  const d = new Date(epoch * 1000)
  return d.getHours() * 60 + d.getMinutes()
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
// Pointer Y → minutes from the top of the hour grid (scroll-aware via rect).
function pointerToMinutes(y: number): number {
  const el = hourGridInner.value
  if (!el) return 0
  return ((y - el.getBoundingClientRect().top) / HOUR_PX) * 60
}
function elAtPoint(x: number, y: number, selector: string): HTMLElement | null {
  const hit = document.elementFromPoint(x, y) as HTMLElement | null
  return hit?.closest(selector) as HTMLElement | null
}
// Which day column an X coordinate falls in, by column geometry. Uses X only
// (not elementFromPoint) so it works from the all-day lane and header too, not
// just from inside the hour grid.
function dayIndexAtX(x: number): number | null {
  const cols = document.querySelectorAll<HTMLElement>('[data-day-index]')
  for (const col of cols) {
    const r = col.getBoundingClientRect()
    if (x >= r.left && x < r.right) {
      const idx = Number(col.dataset.dayIndex)
      return Number.isInteger(idx) ? idx : null
    }
  }
  return null
}
function dateForDayKey(key: string): Date | null {
  return grid.value.find((c) => localDayKey(c.date) === key)?.date ?? null
}
function weekDayIndexOfEpoch(epoch: number): number {
  const weekStart = dayStartEpoch(grid.value[0].date)
  const dayStart = dayStartEpoch(new Date(epoch * 1000))
  return clamp(Math.round((dayStart - weekStart) / 86400), 0, 6)
}

const MAX_DURATION = 14 * 86400 // matches the server-side cap

function onItemPointerDown(ev: PointerEvent, todo: Todo, mode: DragMode) {
  if (ev.button !== 0) return
  const st: DragState = {
    todo, mode, grabOffsetMin: 0, ghost: null, allDayGhost: null, targetDayKey: null,
    label: '', pointer: { x: ev.clientX, y: ev.clientY }, result: null,
  }
  if (mode === 'move' && settingsStore.calendarView === 'week' && todo.due_date != null && !todo.all_day) {
    st.grabOffsetMin = pointerToMinutes(ev.clientY) - minutesOfDay(todo.due_date)
  }
  drag.value = st
  startPointerDrag(ev, {
    onDrag: updateDrag,
    onDrop: finishDrag,
    edgeTarget: () => settingsStore.calendarView === 'week' ? hourGridScroll.value : monthGridEl.value,
    onEdgeNavigate: (dir) => { if (dir < 0) prev(); else next() },
  })
}

function updateDrag(e: PointerEvent) {
  const st = drag.value
  if (!st || st.todo.due_date == null) return
  st.pointer = { x: e.clientX, y: e.clientY }
  if (settingsStore.calendarView === 'week') {
    if (st.todo.all_day) {
      if (st.mode === 'move') projectWeekAllDayMove(st, e)
      else projectWeekAllDayResize(st, e)
    } else if (st.mode === 'move') projectWeekMove(st, e)
    else projectWeekResize(st, e)
  } else {
    if (st.mode === 'resize-span') projectMonthExpand(st, e)
    else projectMonthMove(st, e)
  }
}

function projectWeekMove(st: DragState, e: PointerEvent) {
  const orig = st.todo
  const durSec = orig.duration_seconds ?? 0
  const durMin = durSec > 0 ? durSec / 60 : 30
  let startMin = snap15(pointerToMinutes(e.clientY) - st.grabOffsetMin)
  startMin = clamp(startMin, 0, 1440 - Math.min(durMin, 1440))
  const idx = dayIndexAtX(e.clientX) ?? st.ghost?.dayIndex ?? weekDayIndexOfEpoch(orig.due_date!)
  const date = grid.value[idx]?.date
  if (!date) return
  const due = dayStartEpoch(date) + startMin * 60
  st.result = { due_date: due, duration_seconds: orig.duration_seconds ?? null }
  st.ghost = { dayIndex: idx, topPx: (startMin / 60) * HOUR_PX, heightPx: Math.max((durMin / 60) * HOUR_PX, 14) }
  st.label = formatEventTimeRange(due, orig.duration_seconds ?? null)
}

function projectWeekResize(st: DragState, e: PointerEvent) {
  const orig = st.todo
  const start = orig.due_date!
  const origEnd = start + (orig.duration_seconds ?? 0)
  const startIdx = weekDayIndexOfEpoch(start)
  const date = grid.value[startIdx]?.date
  if (!date) return
  const edgeMin = snap15(pointerToMinutes(e.clientY))
  if (st.mode === 'resize-end') {
    // End can extend into later days (multi-day) via the day under the pointer.
    const idx = clamp(dayIndexAtX(e.clientX) ?? startIdx, startIdx, 6)
    let end = dayStartEpoch(grid.value[idx].date) + edgeMin * 60
    end = Math.max(end, start + 900)
    const duration = Math.min(end - start, MAX_DURATION)
    st.result = { due_date: start, duration_seconds: duration }
    const startMin = minutesOfDay(start)
    st.ghost = {
      dayIndex: startIdx,
      topPx: (startMin / 60) * HOUR_PX,
      heightPx: Math.max(((Math.min(end, dayStartEpoch(date) + 86400) - start) / 3600) * HOUR_PX, 14),
    }
    st.label = formatEventTimeRange(start, duration)
  } else {
    // resize-start: move the top edge, keep the end fixed.
    let newStart = dayStartEpoch(date) + edgeMin * 60
    newStart = Math.min(newStart, origEnd - 900)
    const duration = origEnd - newStart
    st.result = { due_date: newStart, duration_seconds: duration }
    st.ghost = {
      dayIndex: startIdx,
      topPx: (minutesOfDay(newStart) / 60) * HOUR_PX,
      heightPx: Math.max((duration / 3600) * HOUR_PX, 14),
    }
    st.label = formatEventTimeRange(newStart, duration)
  }
}

function projectWeekAllDayMove(st: DragState, e: PointerEvent) {
  const orig = st.todo
  const idx = dayIndexAtX(e.clientX) ?? weekDayIndexOfEpoch(orig.due_date!)
  const date = grid.value[idx]?.date
  if (!date) return
  const due = dayStartEpoch(date)
  const days = Math.max(1, Math.round((orig.duration_seconds ?? 86400) / 86400))
  st.result = { due_date: due, duration_seconds: orig.duration_seconds ?? null }
  st.ghost = null
  st.allDayGhost = { startCol: idx, span: Math.min(days, 7 - idx) }
  st.targetDayKey = localDayKey(date)
  st.label = days > 1 ? `${days} days` : date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}

// Right-edge resize of an all-day event: extend/shrink the span to end on the
// day under the pointer (never shorter than the start day).
function projectWeekAllDayResize(st: DragState, e: PointerEvent) {
  const orig = st.todo
  const start = orig.due_date!
  const startCol = weekDayIndexOfEpoch(start) // clamps to 0 if the event began before this week
  const hoveredIdx = clamp(dayIndexAtX(e.clientX) ?? startCol, startCol, 6)
  const startDay = startOfDayEpoch(new Date(start * 1000))
  const end = Math.max(dayStartEpoch(grid.value[hoveredIdx].date) + 86400, startDay + 86400)
  const duration = Math.min(end - start, MAX_DURATION)
  const days = Math.max(1, Math.round(duration / 86400))
  st.result = { due_date: start, duration_seconds: duration }
  st.ghost = null
  st.allDayGhost = { startCol, span: hoveredIdx - startCol + 1 }
  st.targetDayKey = localDayKey(grid.value[hoveredIdx].date)
  st.label = days > 1 ? `${days} days` : '1 day'
}

function projectMonthMove(st: DragState, e: PointerEvent) {
  const orig = st.todo
  const cell = elAtPoint(e.clientX, e.clientY, '[data-day-cell]')
  const key = cell?.dataset.dayCell
  const date = key ? dateForDayKey(key) : null
  if (!date) return
  // Preserve the original time-of-day; only the day changes.
  const tod = orig.due_date! - startOfDayEpoch(new Date(orig.due_date! * 1000))
  st.result = { due_date: dayStartEpoch(date) + tod, duration_seconds: orig.duration_seconds ?? null }
  st.targetDayKey = localDayKey(date)
  st.label = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function projectMonthExpand(st: DragState, e: PointerEvent) {
  const orig = st.todo
  const start = orig.due_date!
  const cell = elAtPoint(e.clientX, e.clientY, '[data-day-cell]')
  const key = cell?.dataset.dayCell
  const date = key ? dateForDayKey(key) : null
  if (!date) return
  // Span from the start day through the end of the hovered day (never shorter
  // than the start day itself).
  const startDay = startOfDayEpoch(new Date(start * 1000))
  const end = Math.max(dayStartEpoch(date) + 86400, startDay + 86400)
  const duration = Math.min(end - start, MAX_DURATION)
  st.result = { due_date: start, duration_seconds: duration }
  st.targetDayKey = localDayKey(date)
  const days = Math.max(1, Math.round(duration / 86400))
  st.label = days > 1 ? `${days} days` : '1 day'
}

async function finishDrag(moved: boolean) {
  const st = drag.value
  drag.value = null
  if (!st) return
  if (!moved) { openEdit(st.todo); return } // stayed a click
  if (!st.result) return
  await persistDrag(st.todo, st.result.due_date, st.result.duration_seconds)
}

// Recurring drops route through a "this occurrence vs all occurrences" prompt.
interface RecurringPrompt {
  todo: Todo
  occurrenceStart: number
  due_date: number
  duration_seconds: number | null
}
const recurringPrompt = ref<RecurringPrompt | null>(null)

async function persistDrag(todo: Todo, due_date: number, duration_seconds: number | null) {
  const isEvent = todo.type === 'event'
  const recurring = isEvent && (todo.repeat_days > 0 || todo.repeat_months > 0)
  if (recurring) {
    recurringPrompt.value = {
      todo,
      occurrenceStart: todo.occurrence_start ?? todo.due_date ?? due_date,
      due_date,
      duration_seconds,
    }
    return
  }
  const body: Record<string, unknown> = { due_date }
  if (isEvent) body.duration_seconds = duration_seconds
  try {
    const res = await apiFetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(await res.text())
    if (isEvent) {
      todoStore.notifyEventChanged()
    } else {
      todoStore.invalidateList(todo.list_name)
      if (todo.list_name === todoStore.currentList) {
        await todoStore.fetchTodos(todo.list_name, todoStore.currentView, { silent: true })
      }
    }
  } catch (e) {
    error.value = String(e)
  }
  await fetchCalendar()
}

// "This occurrence": upsert a single-occurrence override.
async function applyOccurrence() {
  const p = recurringPrompt.value
  recurringPrompt.value = null
  if (!p) return
  try {
    const res = await apiFetch(`/api/todos/${p.todo.id}/occurrence`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        occurrence_start: p.occurrenceStart,
        due_date: p.due_date,
        duration_seconds: p.duration_seconds,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    todoStore.notifyEventChanged()
  } catch (e) {
    error.value = String(e)
  }
  await fetchCalendar()
}

// "All occurrences": shift the whole series by the same delta + set duration.
async function applySeries() {
  const p = recurringPrompt.value
  recurringPrompt.value = null
  if (!p) return
  try {
    const res = await apiFetch(`/api/todos/${p.todo.id}/series-shift`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delta_seconds: p.due_date - p.occurrenceStart,
        duration_seconds: p.duration_seconds,
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    todoStore.notifyEventChanged()
  } catch (e) {
    error.value = String(e)
  }
  await fetchCalendar()
}

function cancelRecurring() {
  recurringPrompt.value = null
}

// Pixel offset for the "now" indicator on today's column.
const nowLineTopPx = computed(() => {
  const t = new Date(nowEpoch.value * 1000)
  const minutes = t.getHours() * 60 + t.getMinutes()
  return (minutes / 60) * HOUR_PX
})

// Tick the now-line every minute so it slides down through the day.
let nowTickHandle: ReturnType<typeof setInterval> | null = null
function startNowTick() {
  if (nowTickHandle) return
  nowTickHandle = setInterval(() => {
    nowEpoch.value = Math.floor(Date.now() / 1000)
  }, 60_000)
}
function stopNowTick() {
  if (nowTickHandle) {
    clearInterval(nowTickHandle)
    nowTickHandle = null
  }
}

function scrollWeekTo8am() {
  nextTick(() => {
    if (hourGridScroll.value) {
      hourGridScroll.value.scrollTop = 8 * HOUR_PX
    }
  })
}

// Right-click on the hour grid: derive the time from the click's Y offset and
// snap to 15 min. The cell day is passed by the caller.
function onHourCellContextMenu(e: MouseEvent, date: Date) {
  e.preventDefault()
  const col = e.currentTarget as HTMLElement
  const rect = col.getBoundingClientRect()
  const y = e.clientY - rect.top
  const minutes = Math.max(0, Math.min(24 * 60 - 1, (y / HOUR_PX) * 60))
  const snapped = Math.floor(minutes / 15) * 15
  const clicked = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  clicked.setHours(Math.floor(snapped / 60), snapped % 60, 0, 0)
  dayMenu.value = { x: e.clientX, y: e.clientY, date: clicked }
}

const nowEpoch = ref(Math.floor(Date.now() / 1000))
function isSnoozed(t: Todo): boolean {
  return t.snoozed_until != null && t.snoozed_until > nowEpoch.value
}

async function fetchCalendar() {
  const cells = grid.value
  const from = startOfDayEpoch(cells[0].date)
  const to = startOfDayEpoch(cells[cells.length - 1].date) + 86400
  loading.value = true
  error.value = null
  try {
    const res = await apiFetch(`/api/todos/calendar?from=${from}&to=${to}`)
    if (!res.ok) {
      error.value = res.status === 403 ? 'Pro plan required.' : `Error ${res.status}`
      return
    }
    const data = await res.json() as { todos: Todo[] }
    todos.value = Array.isArray(data.todos) ? data.todos : []
    nowEpoch.value = Math.floor(Date.now() / 1000)
  } catch (e) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
}

watch(viewAnchor, fetchCalendar)
// Refetch when an event is added from the +Add menu while the calendar is open.
watch(() => todoStore.eventsVersion, () => { fetchCalendar() })
onMounted(() => {
  fetchCalendar()
  if (settingsStore.calendarView === 'week') {
    scrollWeekTo8am()
    startNowTick()
  }
})

// Toggle the now-tick + auto-scroll whenever the view mode changes at runtime.
watch(() => settingsStore.calendarView, (mode) => {
  if (mode === 'week') {
    scrollWeekTo8am()
    startNowTick()
  } else {
    stopNowTick()
  }
})

function prev() {
  const a = viewAnchor.value
  viewAnchor.value = settingsStore.calendarView === 'week'
    ? addDays(startOfWeek(a), -7)
    : new Date(a.getFullYear(), a.getMonth() - 1, 1)
}
function next() {
  const a = viewAnchor.value
  viewAnchor.value = settingsStore.calendarView === 'week'
    ? addDays(startOfWeek(a), 7)
    : new Date(a.getFullYear(), a.getMonth() + 1, 1)
}
function goToday() {
  const t = new Date()
  viewAnchor.value = settingsStore.calendarView === 'week'
    ? startOfWeek(t)
    : new Date(t.getFullYear(), t.getMonth(), 1)
}

function setView(v: 'month' | 'week') {
  if (settingsStore.calendarView === v) return
  settingsStore.setCalendarView(v)
  // Snap the anchor into the natural starting bucket for the new mode so the
  // user lands on "now" rather than wherever the previous mode left them.
  // The mode watcher above handles the now-tick + auto-scroll side effects.
  const t = new Date()
  viewAnchor.value = v === 'week'
    ? startOfWeek(t)
    : new Date(t.getFullYear(), t.getMonth(), 1)
}

function dayItems(date: Date): Todo[] {
  return todosByDay.value.get(localDayKey(date)) ?? []
}

const visibleChipsPerCell = 3

function chipsFor(date: Date): { visible: Todo[]; overflow: number } {
  const items = dayItems(date)
  if (items.length <= visibleChipsPerCell) return { visible: items, overflow: 0 }
  return {
    visible: items.slice(0, visibleChipsPerCell),
    overflow: items.length - visibleChipsPerCell,
  }
}

const overflowRect = ref<{ top: number; left: number; width: number } | null>(null)

function updateOverflowRect(cellEl: HTMLElement | null) {
  if (!cellEl) {
    overflowRect.value = null
    return
  }
  const r = cellEl.getBoundingClientRect()
  // Anchor under the date number (matches the prior top-7 / left-1 / right-1).
  overflowRect.value = {
    top: r.top + 28,
    left: r.left + 4,
    width: Math.max(0, r.width - 8),
  }
}

function openOverflow(date: Date, ev: MouseEvent) {
  openDayKey.value = localDayKey(date)
  const cell = (ev.currentTarget as HTMLElement | null)?.closest('[data-day-cell]') as HTMLElement | null
  updateOverflowRect(cell)
}
function closeOverflow() {
  openDayKey.value = null
  overflowRect.value = null
}

function onReposition() {
  if (!openDayKey.value) return
  const cell = document.querySelector<HTMLElement>(`[data-day-cell="${openDayKey.value}"]`)
  updateOverflowRect(cell)
}

async function openEdit(todo: Todo) {
  closeOverflow()
  editing.value = todo
  editingCategories.value = await todoStore.fetchCategoriesFor(todo.list_name)
}

async function handleEditSubmit(form: TodoFormData) {
  if (!editing.value) return
  const id = editing.value.id
  const list = editing.value.list_name
  const isEvent = editing.value.type === 'event'
  editing.value = null
  try {
    // Bypass todoStore.updateTodo: it scopes its in-memory patch / cache
    // invalidation / count refresh to currentList, and the calendar can edit
    // items from any list. We hit the API directly, then nudge the store to
    // drop the edited list's cache and (if it happens to be the active list)
    // refetch so the next mode switch shows fresh data.
    const res = await apiFetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) throw new Error(await res.text())
    if (isEvent) {
      todoStore.notifyEventChanged()
    } else {
      todoStore.invalidateList(list)
      if (list === todoStore.currentList) {
        await todoStore.fetchTodos(list, todoStore.currentView, { silent: true })
      }
    }
  } catch (e) {
    error.value = String(e)
  }
  await fetchCalendar()
}

function handleEditCancel() {
  editing.value = null
}

async function handleEditDelete() {
  if (!editing.value) return
  const id = editing.value.id
  const wasEvent = editing.value.type === 'event'
  editing.value = null
  try {
    const res = await apiFetch(`/api/todos/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    if (wasEvent) todoStore.notifyEventChanged()
  } catch (e) {
    error.value = String(e)
  }
  await fetchCalendar()
}

function isToday(date: Date): boolean {
  return isSameDay(date, today)
}

function onCellContextMenu(e: MouseEvent, date: Date) {
  e.preventDefault()
  dayMenu.value = { x: e.clientX, y: e.clientY, date: new Date(date) }
}

function closeDayMenu() {
  dayMenu.value = null
}

async function openCreateEvent() {
  if (!dayMenu.value) return
  const d = new Date(dayMenu.value.date)
  // Week view's right-click already snapped to the clicked hour (15-min
  // granularity); month view passes a date at midnight, so default to 9 AM
  // there as a sensible business-hours starting point.
  if (settingsStore.calendarView === 'month') {
    d.setHours(9, 0, 0, 0)
  }
  creatingDue.value = Math.floor(d.getTime() / 1000)
  closeDayMenu()
  creatingCategories.value = await todoStore.fetchCategoriesFor(listStore.activeList)
}

async function handleCreateSubmit(form: TodoFormData) {
  creatingDue.value = null
  await todoStore.addTodo(listStore.activeList, form)
  await fetchCalendar()
}

function handleCreateCancel() {
  creatingDue.value = null
}

// Events always carry a colour (their own or the accent default); todos only
// when the user picked one. Uncoloured todos keep their surface + priority
// border. `.cal-chip` reads the `--evt` custom property set by chipColorVar().
function isColoured(t: Todo): boolean {
  return t.type === 'event' || t.color != null
}

function chipBaseClass(t: Todo): string {
  return [
    'flex items-center gap-1.5 rounded px-1.5 py-1 text-sm leading-tight',
    'border-l-4 cursor-pointer truncate',
    isColoured(t)
      ? 'cal-chip text-text'
      : 'bg-surface-hover/60 hover:bg-surface-hover ' + priorityBorderClass(t.priority),
    (isSnoozed(t) || isPast(t)) ? 'opacity-55' : '',
  ].filter(Boolean).join(' ')
}

function chipColorVar(t: Todo): Record<string, string> {
  return isColoured(t) ? colorVar(t.color) : {}
}

// Past events render dimmed. Scoped to events only — an overdue *todo* should
// stay prominent, not fade. `eventEnd` returns due_date for point-in-time events.
function isPast(t: Todo): boolean {
  if (t.type !== 'event' || t.due_date == null) return false
  return eventEnd(t) <= nowEpoch.value
}

function formatEventTime(t: Todo): string {
  if (t.due_date == null) return ''
  if (t.all_day) {
    const days = Math.max(1, Math.round((t.duration_seconds ?? 86400) / 86400))
    return days > 1 ? `All day · ${days} days` : 'All day'
  }
  return formatEventTimeRange(t.due_date, t.duration_seconds)
}

function eventRecurrenceLabel(t: Todo): string {
  if (t.type !== 'event') return ''
  return describeRecurrence(t.repeat_days, t.repeat_months)
}

// Recurring events expand to multiple rows with the same series id; key the
// list on (id, due_date) so Vue treats each occurrence as a distinct entry.
function eventKey(t: Todo): string {
  return `${t.id}-${t.due_date ?? 0}`
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (editing.value || creatingDue.value != null) return // TodoForm handles its own escape
    if (recurringPrompt.value) {
      cancelRecurring()
      return
    }
    if (dayMenu.value) {
      closeDayMenu()
      return
    }
    if (openDayKey.value) closeOverflow()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onReposition)
  window.addEventListener('scroll', onReposition, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onReposition)
  window.removeEventListener('scroll', onReposition, true)
  stopNowTick()
})

// Recompute on month change in case the popover was open during a re-render.
watch(grid, () => { if (openDayKey.value) nextTick(onReposition) })
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col">
    <!-- Header — pinned so it stays visible while the calendar scrolls
         (mainly relevant for the week view's tall hour grid). -->
    <div class="sticky top-0 z-30 bg-bg flex items-center justify-between gap-3 -mx-4 px-4 py-2 -mt-4 mb-3">
      <div class="flex items-center gap-1">
        <button
          class="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
          :title="settingsStore.calendarView === 'week' ? 'Previous week' : 'Previous month'"
          @click="prev"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 class="text-base font-medium text-text px-2 min-w-40 text-center">{{ monthLabel }}</h2>
        <button
          class="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
          :title="settingsStore.calendarView === 'week' ? 'Next week' : 'Next month'"
          @click="next"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="px-2.5 py-1 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors"
          @click="goToday"
        >
          Today
        </button>
        <div class="inline-flex rounded-lg border border-border overflow-hidden text-sm">
          <button
            class="px-2.5 py-1 transition-colors"
            :class="settingsStore.calendarView === 'month'
              ? 'bg-accent text-accent-fg'
              : 'text-muted hover:text-text hover:bg-surface-hover'"
            @click="setView('month')"
          >
            Month
          </button>
          <button
            class="px-2.5 py-1 transition-colors border-l border-border"
            :class="settingsStore.calendarView === 'week'
              ? 'bg-accent text-accent-fg'
              : 'text-muted hover:text-text hover:bg-surface-hover'"
            @click="setView('week')"
          >
            Week
          </button>
        </div>
        <span v-if="loading" class="size-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    </div>

    <p v-if="error" class="text-sm text-danger mb-2">{{ error }}</p>

    <!-- Desktop / tablet month grid -->
    <div v-if="settingsStore.calendarView === 'month'" class="hidden md:flex md:flex-col flex-1 min-h-0">
      <div class="grid grid-cols-7 text-xs text-muted uppercase tracking-wider mb-1">
        <div v-for="d in WEEKDAY_LABELS" :key="d" class="px-2 py-1">{{ d }}</div>
      </div>
      <div
        ref="monthGridEl"
        class="grid grid-cols-7 grid-rows-6 gap-px bg-border rounded-lg overflow-hidden border border-border flex-1 min-h-0"
        :class="isDragging ? 'select-none' : ''"
      >
        <div
          v-for="cell in grid"
          :key="cell.date.toISOString()"
          :data-day-cell="localDayKey(cell.date)"
          class="relative bg-bg min-h-24 p-1.5 flex flex-col gap-1 overflow-hidden"
          :class="[
            !cell.inMonth ? 'bg-surface/30' : '',
            isToday(cell.date) ? 'bg-accent/10 inset-ring-1 inset-ring-accent/40' : '',
            drag && drag.targetDayKey === localDayKey(cell.date) ? 'inset-ring-2 inset-ring-accent' : '',
          ]"
          @contextmenu="onCellContextMenu($event, cell.date)"
        >
          <div class="flex items-center justify-between text-[11px]">
            <span
              class="inline-flex items-center justify-center size-5 rounded-full"
              :class="[
                isToday(cell.date)
                  ? 'bg-accent text-accent-fg font-semibold'
                  : (!cell.inMonth ? 'text-muted/60' : 'text-text'),
              ]"
            >
              {{ cell.date.getDate() }}
            </span>
          </div>

          <button
            v-for="t in chipsFor(cell.date).visible"
            :key="t.type === 'event' ? eventKey(t) : t.id"
            class="group/chip relative text-left touch-none cursor-grab active:cursor-grabbing"
            :title="t.type === 'event' ? `Event · ${formatEventTime(t)}${eventRecurrenceLabel(t) ? ' · ' + eventRecurrenceLabel(t) : ''}` : `${t.list_name} : ${t.category}`"
            @pointerdown="onItemPointerDown($event, t, 'move')"
          >
            <span :class="chipBaseClass(t)" :style="chipColorVar(t)">
              <svg
                v-if="t.type === 'event'"
                class="size-3 shrink-0 text-accent"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span v-else class="size-1.5 rounded-full shrink-0" :class="listColour(t.list_name)" />
              <span class="truncate flex-1">{{ t.title }}</span>
              <span v-if="t.type === 'event' && eventRecurrenceLabel(t)" class="text-[10px] text-accent/80 shrink-0" aria-label="Recurring">↻</span>
            </span>
            <!-- Expand handle: drag the right edge across cells to span days (events only). -->
            <div
              v-if="t.type === 'event'"
              class="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize opacity-0 group-hover/chip:opacity-100"
              @pointerdown.stop="onItemPointerDown($event, t, 'resize-span')"
            />
          </button>

          <button
            v-if="chipsFor(cell.date).overflow > 0"
            class="text-left text-xs text-muted hover:text-text px-1.5"
            @click="openOverflow(cell.date, $event)"
          >
            +{{ chipsFor(cell.date).overflow }} more
          </button>

          <!-- Per-day popover (teleported to body so it isn't clipped by the cell/grid `overflow-hidden`) -->
          <Teleport to="body">
          <div
            v-if="openDayKey === localDayKey(cell.date) && overflowRect"
            class="fixed z-50 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg p-2 space-y-1"
            :style="{ top: overflowRect.top + 'px', left: overflowRect.left + 'px', width: overflowRect.width + 'px' }"
            @click.stop
          >
            <div class="text-xs text-muted px-1 pb-1 border-b border-border mb-1">
              {{ cell.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) }}
            </div>
            <button
              v-for="t in dayItems(cell.date)"
              :key="t.type === 'event' ? eventKey(t) : t.id"
              class="block w-full text-left"
              :title="t.type === 'event' ? `Event · ${formatEventTime(t)}${eventRecurrenceLabel(t) ? ' · ' + eventRecurrenceLabel(t) : ''}` : `${t.list_name} : ${t.category}`"
              @click="openEdit(t)"
            >
              <span :class="chipBaseClass(t)" :style="chipColorVar(t)">
                <svg
                  v-if="t.type === 'event'"
                  class="size-3 shrink-0 text-accent"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span v-else class="size-1.5 rounded-full shrink-0" :class="listColour(t.list_name)" />
                <span class="truncate flex-1">{{ t.title }}</span>
                <span v-if="t.type === 'event' && eventRecurrenceLabel(t)" class="text-[10px] text-accent/80 shrink-0" aria-label="Recurring">↻</span>
              </span>
            </button>
          </div>
          </Teleport>
        </div>
      </div>

      <!-- Click-outside catcher for popover -->
      <div
        v-if="openDayKey"
        class="fixed inset-0 z-20"
        @click="closeOverflow"
      />
    </div>

    <!-- Desktop / tablet week hour grid -->
    <div v-if="settingsStore.calendarView === 'week'" class="hidden md:flex md:flex-col flex-1 min-h-0">
      <!-- Day headers: spacer + 7 columns. Sticky below the calendar nav so
           they stay visible while the hour grid (or the outer container)
           scrolls. The top offset clears the sticky nav above it. -->
      <div class="sticky top-[44px] z-20 bg-bg grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] text-xs mb-1 pt-2 border-b border-border">
        <div></div>
        <div
          v-for="cell in grid"
          :key="cell.date.toISOString()"
          class="px-2 py-1 flex items-center justify-center gap-1.5"
        >
          <span class="uppercase tracking-wider text-muted">
            {{ cell.date.toLocaleDateString(undefined, { weekday: 'short' }) }}
          </span>
          <span
            class="inline-flex items-center justify-center size-5 rounded-full"
            :class="isToday(cell.date) ? 'bg-accent text-accent-fg font-semibold' : 'text-text'"
          >
            {{ cell.date.getDate() }}
          </span>
        </div>
      </div>

      <!-- All-day lane: horizontal bars above the hour grid, only shown when
           there are all-day events in the visible week. -->
      <div
        v-if="weekAllDayBars.rows > 0"
        class="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] mb-1 border-b border-border pb-1"
      >
        <div class="flex items-start justify-end pr-2 pt-1 text-[10px] uppercase tracking-wider text-muted">
          All-day
        </div>
        <div
          class="col-start-2 col-span-7 relative"
          :style="{ height: `${weekAllDayBars.rows * (ALLDAY_BAR_PX + 2) + 2}px` }"
        >
          <button
            v-for="bar in weekAllDayBars.bars"
            :key="bar.key"
            class="group/aday absolute rounded cal-block border-l-4 flex items-center overflow-hidden px-1.5 text-left text-[11px] transition-colors touch-none cursor-grab active:cursor-grabbing"
            :style="{
              top: `${bar.row * (ALLDAY_BAR_PX + 2)}px`,
              height: `${ALLDAY_BAR_PX}px`,
              left: `calc(${(bar.startCol / 7) * 100}% + 2px)`,
              width: `calc(${(bar.span / 7) * 100}% - 4px)`,
              opacity: isPast(bar.todo) ? 0.55 : undefined,
              ...colorVar(bar.todo.color),
            }"
            :title="`${bar.todo.title} · ${formatEventTime(bar.todo)}${eventRecurrenceLabel(bar.todo) ? ' · ' + eventRecurrenceLabel(bar.todo) : ''}`"
            @pointerdown="onItemPointerDown($event, bar.todo, 'move')"
          >
            <span class="truncate font-medium text-text pointer-events-none">{{ bar.todo.title }}</span>
            <!-- Resize handle: drag the right edge to extend/shrink the span. -->
            <div
              class="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover/aday:opacity-100"
              @pointerdown.stop="onItemPointerDown($event, bar.todo, 'resize-span')"
            />
          </button>

          <!-- Live ghost while dragging/resizing an all-day event. -->
          <div
            v-if="drag && drag.allDayGhost"
            class="absolute top-0 z-20 flex items-center rounded border-2 border-dashed border-accent bg-accent/20 px-1.5 text-[10px] text-text pointer-events-none overflow-hidden"
            :style="{
              height: `${ALLDAY_BAR_PX}px`,
              left: `calc(${(drag.allDayGhost.startCol / 7) * 100}% + 2px)`,
              width: `calc(${(drag.allDayGhost.span / 7) * 100}% - 4px)`,
            }"
          >
            {{ drag.label }}
          </div>
        </div>
      </div>

      <!-- Scrollable hour grid -->
      <div
        ref="hourGridScroll"
        class="overflow-y-auto flex-1 min-h-0 border border-border rounded-lg bg-bg"
      >
        <div
          ref="hourGridInner"
          class="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] relative"
          :class="isDragging ? 'select-none' : ''"
          :style="{ height: `${24 * HOUR_PX}px` }"
        >
          <!-- Hour labels column -->
          <div class="relative">
            <div
              v-for="h in HOURS"
              :key="h"
              class="absolute right-2 -translate-y-1/2 text-[10px] text-muted tabular-nums"
              :style="{ top: `${h * HOUR_PX}px` }"
            >
              {{ h === 0 ? '' : String(h).padStart(2, '0') + ':00' }}
            </div>
          </div>

          <!-- Day columns -->
          <div
            v-for="(cell, idx) in grid"
            :key="cell.date.toISOString()"
            :data-day-index="idx"
            class="relative border-l border-border"
            :class="isToday(cell.date) ? 'bg-accent/5' : ''"
            @contextmenu="onHourCellContextMenu($event, cell.date)"
          >
            <!-- Hour grid lines -->
            <div
              v-for="h in HOURS"
              :key="h"
              class="absolute left-0 right-0 border-t border-border/40"
              :style="{ top: `${h * HOUR_PX}px` }"
            />

            <!-- Event blocks -->
            <button
              v-for="b in blocksFor(cell.date)"
              :key="b.key"
              class="group absolute rounded-md cal-block border-l-4 text-left text-[11px] overflow-hidden px-1.5 py-0.5 transition-colors touch-none cursor-grab active:cursor-grabbing"
              :style="{
                top: `${b.topPx}px`,
                height: `${b.heightPx}px`,
                left: `calc(${b.leftPct}% + 2px)`,
                width: `calc(${b.widthPct}% - 4px)`,
                opacity: isPast(b.todo) ? 0.55 : undefined,
                ...colorVar(b.todo.color),
              }"
              :title="`${b.todo.title} · ${formatEventTime(b.todo)}${eventRecurrenceLabel(b.todo) ? ' · ' + eventRecurrenceLabel(b.todo) : ''}`"
              @pointerdown="onItemPointerDown($event, b.todo, 'move')"
            >
              <div class="font-medium text-text truncate pointer-events-none">{{ b.todo.title }}</div>
              <div v-if="b.heightPx >= 28" class="text-[10px] text-muted truncate pointer-events-none">
                {{ formatEventTime(b.todo) }}
              </div>
              <!-- Resize handles (events only; todos have no duration). -->
              <template v-if="b.todo.type === 'event'">
                <div
                  class="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
                  @pointerdown.stop="onItemPointerDown($event, b.todo, 'resize-start')"
                />
                <div
                  class="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
                  @pointerdown.stop="onItemPointerDown($event, b.todo, 'resize-end')"
                />
              </template>
            </button>

            <!-- Drag ghost for this column -->
            <div
              v-if="drag && drag.ghost && drag.ghost.dayIndex === idx"
              class="absolute z-20 rounded-md border-l-4 border-dashed border-accent bg-accent/25 pointer-events-none px-1.5 py-0.5 text-[10px] text-text overflow-hidden"
              :style="{
                top: `${drag.ghost.topPx}px`,
                height: `${drag.ghost.heightPx}px`,
                left: 'calc(2px)',
                width: 'calc(100% - 4px)',
              }"
            >
              {{ drag.label }}
            </div>

            <!-- "Now" indicator on today's column -->
            <div
              v-if="isToday(cell.date)"
              class="absolute left-0 right-0 pointer-events-none z-10"
              :style="{ top: `${nowLineTopPx}px` }"
            >
              <div class="h-px bg-rose-500"></div>
              <div class="absolute -left-1 -top-1 size-2 rounded-full bg-rose-500"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile agenda list -->
    <div class="md:hidden space-y-3">
      <div v-if="agendaDays.length === 0 && !loading" class="text-center text-muted py-12 text-sm">
        No scheduled todos {{ emptyPreposition }} {{ monthLabel }}
      </div>
      <div
        v-for="day in agendaDays"
        :key="localDayKey(day.date)"
        class="bg-surface border border-border rounded-lg p-3"
      >
        <div class="text-xs uppercase tracking-wider text-muted mb-2">
          {{ day.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) }}
          <span v-if="isSameDay(day.date, today)" class="ml-1 text-accent">· today</span>
        </div>
        <div class="space-y-1.5">
          <button
            v-for="t in day.items"
            :key="t.type === 'event' ? eventKey(t) : t.id"
            class="w-full text-left"
            :title="t.type === 'event' ? `Event · ${formatEventTime(t)}${eventRecurrenceLabel(t) ? ' · ' + eventRecurrenceLabel(t) : ''}` : `${t.list_name} : ${t.category}`"
            @click="openEdit(t)"
          >
            <span :class="chipBaseClass(t)" :style="chipColorVar(t)">
              <svg
                v-if="t.type === 'event'"
                class="size-3 shrink-0 text-accent"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span v-else class="size-2 rounded-full shrink-0" :class="listColour(t.list_name)" />
              <span class="truncate flex-1">{{ t.title }}</span>
              <span v-if="t.type === 'event' && eventRecurrenceLabel(t)" class="text-[10px] text-accent/80 shrink-0" aria-label="Recurring">↻</span>
              <span class="text-[10px] text-muted shrink-0">{{ t.type === 'event' ? formatEventTime(t) : t.list_name }}</span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Desktop empty state overlay (only when truly empty) -->
    <div
      v-if="agendaDays.length === 0 && !loading"
      class="hidden sm:block text-center text-muted py-2 text-sm"
    >
      No scheduled todos {{ emptyPreposition }} {{ monthLabel }}
    </div>

    <!-- Floating drag label (month move/expand + all-day move; week uses the
         in-column ghost's own label). -->
    <div
      v-if="isDragging && drag && drag.label && !drag.ghost && !drag.allDayGhost"
      class="fixed z-[60] pointer-events-none rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-text shadow-lg"
      :style="{ left: `${drag.pointer.x + 12}px`, top: `${drag.pointer.y + 12}px` }"
    >
      {{ drag.label }}
    </div>

    <!-- Recurring drop: this occurrence vs. the whole series -->
    <div v-if="recurringPrompt" class="modal-backdrop" @click.self="cancelRecurring">
      <div class="modal-card max-w-sm">
        <div class="modal-header">
          <span class="modal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5">
              <path d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <h3 class="flex-1 text-base font-semibold text-text">Move recurring event</h3>
        </div>
        <div class="px-5 py-4 text-sm text-muted">
          “{{ recurringPrompt.todo.title }}” repeats. Apply this change to just this
          occurrence or the whole series?
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" @click="cancelRecurring">Cancel</button>
          <div class="flex-1" />
          <button type="button" class="btn-ghost" @click="applyOccurrence">This occurrence</button>
          <button type="button" class="btn-primary" @click="applySeries">All occurrences</button>
        </div>
      </div>
    </div>

    <!-- Edit modal -->
    <TodoForm
      v-if="editing"
      :initial="editing"
      :categories="editingCategories"
      @submit="handleEditSubmit"
      @cancel="handleEditCancel"
      @delete="handleEditDelete"
    />

    <!-- Create-event modal (right-click → Create Event) -->
    <TodoForm
      v-if="creatingDue != null"
      :categories="creatingCategories"
      initial-type="event"
      :initial-due="creatingDue"
      :initial-duration-seconds="1800"
      @submit="handleCreateSubmit"
      @cancel="handleCreateCancel"
    />

    <!-- Right-click context menu -->
    <template v-if="dayMenu">
      <div class="fixed inset-0 z-40" @click="closeDayMenu" @contextmenu.prevent="closeDayMenu" />
      <div
        class="fixed z-50 bg-surface border border-border-strong rounded-lg shadow-lg py-1 min-w-44 dark:inset-ring dark:inset-ring-white/5"
        :style="{ left: `${dayMenu.x}px`, top: `${dayMenu.y}px` }"
      >
        <button
          class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
          @click="openCreateEvent"
        >
          <svg class="size-3.5 text-muted shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          Create Event
        </button>
      </div>
    </template>
  </div>
</template>
