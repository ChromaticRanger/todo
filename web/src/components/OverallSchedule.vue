<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Todo, TodoFormData } from '../types/todo'
import { apiFetch } from '../lib/api'
import { useTodoStore } from '../stores/todoStore'
import { priorityBorderClass } from '../lib/priorityClass'
import TodoForm from './TodoForm.vue'

const todoStore = useTodoStore()

const today = new Date()
const viewMonth = ref<{ year: number; month: number }>({
  year: today.getFullYear(),
  month: today.getMonth(),
})

const todos = ref<Todo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const openDayKey = ref<string | null>(null)
const editing = ref<Todo | null>(null)
const editingCategories = ref<string[]>([])

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

// Mon-start grid, always 6 rows × 7 cols.
function buildMonthGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
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

const grid = computed(() => buildMonthGrid(viewMonth.value.year, viewMonth.value.month))

const monthLabel = computed(() => {
  const d = new Date(viewMonth.value.year, viewMonth.value.month, 1)
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
})

const todosByDay = computed(() => {
  const map = new Map<string, Todo[]>()
  for (const t of todos.value) {
    if (t.due_date == null) continue
    const key = localDayKey(t.due_date)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
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

watch(viewMonth, fetchCalendar, { deep: true })
// Refetch when an event is added from the +Add menu while the calendar is open.
watch(() => todoStore.eventsVersion, () => { fetchCalendar() })
onMounted(fetchCalendar)

function prevMonth() {
  const m = viewMonth.value.month - 1
  viewMonth.value = m < 0
    ? { year: viewMonth.value.year - 1, month: 11 }
    : { year: viewMonth.value.year, month: m }
}
function nextMonth() {
  const m = viewMonth.value.month + 1
  viewMonth.value = m > 11
    ? { year: viewMonth.value.year + 1, month: 0 }
    : { year: viewMonth.value.year, month: m }
}
function goToday() {
  const t = new Date()
  viewMonth.value = { year: t.getFullYear(), month: t.getMonth() }
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

function openOverflow(date: Date) {
  openDayKey.value = localDayKey(date)
}
function closeOverflow() {
  openDayKey.value = null
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

function todayClass(date: Date): string {
  return isSameDay(date, today) ? 'ring-1 ring-accent' : ''
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

function formatEventTime(epoch: number | null): string {
  if (epoch == null) return ''
  return new Date(epoch * 1000).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (editing.value) return // TodoForm handles its own escape
    if (openDayKey.value) closeOverflow()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-1">
        <button
          class="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
          title="Previous month"
          @click="prevMonth"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 class="text-base font-medium text-text px-2 min-w-40 text-center">{{ monthLabel }}</h2>
        <button
          class="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
          title="Next month"
          @click="nextMonth"
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
        <span v-if="loading" class="size-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    </div>

    <p v-if="error" class="text-sm text-danger mb-2">{{ error }}</p>

    <!-- Desktop / tablet grid -->
    <div class="hidden sm:flex sm:flex-col flex-1 min-h-0">
      <div class="grid grid-cols-7 text-xs text-muted uppercase tracking-wider mb-1">
        <div v-for="d in WEEKDAY_LABELS" :key="d" class="px-2 py-1">{{ d }}</div>
      </div>
      <div class="grid grid-cols-7 grid-rows-6 gap-px bg-border rounded-lg overflow-hidden border border-border flex-1 min-h-0">
        <div
          v-for="cell in grid"
          :key="cell.date.toISOString()"
          class="relative bg-bg min-h-24 p-1.5 flex flex-col gap-1 overflow-hidden"
          :class="[!cell.inMonth ? 'bg-surface/30' : '']"
        >
          <div class="flex items-center justify-between text-[11px]">
            <span
              class="inline-flex items-center justify-center size-5 rounded-full"
              :class="[
                !cell.inMonth ? 'text-muted/60' : 'text-text',
                todayClass(cell.date),
              ]"
            >
              {{ cell.date.getDate() }}
            </span>
          </div>

          <button
            v-for="t in chipsFor(cell.date).visible"
            :key="t.id"
            class="text-left"
            :title="t.type === 'event' ? `Event · ${formatEventTime(t.due_date)}` : `${t.list_name} : ${t.category}`"
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
            </span>
          </button>

          <button
            v-if="chipsFor(cell.date).overflow > 0"
            class="text-left text-xs text-muted hover:text-text px-1.5"
            @click="openOverflow(cell.date)"
          >
            +{{ chipsFor(cell.date).overflow }} more
          </button>

          <!-- Per-day popover -->
          <div
            v-if="openDayKey === localDayKey(cell.date)"
            class="absolute z-30 top-7 left-1 right-1 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg p-2 space-y-1"
            @click.stop
          >
            <div class="text-xs text-muted px-1 pb-1 border-b border-border mb-1">
              {{ cell.date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }) }}
            </div>
            <button
              v-for="t in dayItems(cell.date)"
              :key="t.id"
              class="block w-full text-left"
              :title="t.type === 'event' ? `Event · ${formatEventTime(t.due_date)}` : `${t.list_name} : ${t.category}`"
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
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Click-outside catcher for popover -->
      <div
        v-if="openDayKey"
        class="fixed inset-0 z-20"
        @click="closeOverflow"
      />
    </div>

    <!-- Mobile agenda list -->
    <div class="sm:hidden space-y-3">
      <div v-if="agendaDays.length === 0 && !loading" class="text-center text-muted py-12 text-sm">
        No scheduled todos in {{ monthLabel }}
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
            :key="t.id"
            class="w-full text-left"
            :title="t.type === 'event' ? `Event · ${formatEventTime(t.due_date)}` : `${t.list_name} : ${t.category}`"
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
              <span class="text-[10px] text-muted shrink-0">{{ t.type === 'event' ? formatEventTime(t.due_date) : t.list_name }}</span>
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
      No scheduled todos in {{ monthLabel }}
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
  </div>
</template>
