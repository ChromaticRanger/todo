<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { Todo, TodoFormData } from '../types/todo'
import { apiFetch } from '../lib/api'
import { useTodoStore } from '../stores/todoStore'
import { useListStore } from '../stores/listStore'
import { useSettingsStore } from '../stores/settingsStore'
import { priorityBorderClass } from '../lib/priorityClass'
import { describeRecurrence } from '../lib/recurrence'
import { formatEventTimeRange } from '../lib/eventTime'
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
      if (t.type !== 'event' || t.due_date == null) continue
      const dur = t.duration_seconds ?? 0
      const evStart = t.due_date
      const evEnd = t.due_date + dur
      // Skip events that don't touch this day.
      if (evEnd <= dayStart || evStart >= dayEnd) continue
      // Treat point-in-time events as a 30-min block so they're visible.
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

function chipBaseClass(t: Todo): string {
  return [
    'flex items-center gap-1.5 rounded px-1.5 py-1 text-sm leading-tight',
    'border-l-4 cursor-pointer truncate',
    t.type === 'event'
      ? 'bg-accent/15 hover:bg-accent/25 border-accent text-text'
      : 'bg-surface-hover/60 hover:bg-surface-hover ' + priorityBorderClass(t.priority),
    isSnoozed(t) ? 'opacity-50' : '',
  ].filter(Boolean).join(' ')
}

function formatEventTime(t: Todo): string {
  if (t.due_date == null) return ''
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
    <div v-if="settingsStore.calendarView === 'month'" class="hidden sm:flex sm:flex-col flex-1 min-h-0">
      <div class="grid grid-cols-7 text-xs text-muted uppercase tracking-wider mb-1">
        <div v-for="d in WEEKDAY_LABELS" :key="d" class="px-2 py-1">{{ d }}</div>
      </div>
      <div class="grid grid-cols-7 grid-rows-6 gap-px bg-border rounded-lg overflow-hidden border border-border flex-1 min-h-0">
        <div
          v-for="cell in grid"
          :key="cell.date.toISOString()"
          :data-day-cell="localDayKey(cell.date)"
          class="relative bg-bg min-h-24 p-1.5 flex flex-col gap-1 overflow-hidden"
          :class="[
            !cell.inMonth ? 'bg-surface/30' : '',
            isToday(cell.date) ? 'bg-accent/10 inset-ring-1 inset-ring-accent/40' : '',
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
            class="text-left"
            :title="t.type === 'event' ? `Event · ${formatEventTime(t)}${eventRecurrenceLabel(t) ? ' · ' + eventRecurrenceLabel(t) : ''}` : `${t.list_name} : ${t.category}`"
            @click="openEdit(t)"
          >
            <span :class="chipBaseClass(t)">
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
              <span :class="chipBaseClass(t)">
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
    <div v-if="settingsStore.calendarView === 'week'" class="hidden sm:flex sm:flex-col flex-1 min-h-0">
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

      <!-- Scrollable hour grid -->
      <div
        ref="hourGridScroll"
        class="overflow-y-auto flex-1 min-h-0 border border-border rounded-lg bg-bg"
      >
        <div
          class="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] relative"
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
            v-for="cell in grid"
            :key="cell.date.toISOString()"
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
              class="absolute rounded-md bg-accent/20 hover:bg-accent/30 border-l-4 border-accent text-left text-[11px] overflow-hidden px-1.5 py-0.5 transition-colors"
              :style="{
                top: `${b.topPx}px`,
                height: `${b.heightPx}px`,
                left: `calc(${b.leftPct}% + 2px)`,
                width: `calc(${b.widthPct}% - 4px)`,
              }"
              :title="`${b.todo.title} · ${formatEventTime(b.todo)}${eventRecurrenceLabel(b.todo) ? ' · ' + eventRecurrenceLabel(b.todo) : ''}`"
              @click.stop="openEdit(b.todo)"
            >
              <div class="font-medium text-text truncate">{{ b.todo.title }}</div>
              <div v-if="b.heightPx >= 28" class="text-[10px] text-muted truncate">
                {{ formatEventTime(b.todo) }}
              </div>
            </button>

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
    <div class="sm:hidden space-y-3">
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
            <span :class="chipBaseClass(t)">
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
