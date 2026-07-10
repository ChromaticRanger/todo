import { ref, computed, watch, onUnmounted } from 'vue'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useTodoStore } from '../stores/todoStore'
import { showNativeNotification } from '../lib/notifications'
import type { Todo } from '../types/todo'

export interface DueToast {
  id: number
  title: string
  // Sub-line under the title, e.g. "Event · starts now".
  detail: string
  kind: Todo['type']
}

// How often we compare watched items against the clock (fire precision) and how
// often we refetch the day's feed as a safety net. The compare is a cheap
// in-memory scan, so we tick often for punctual firing; refetching hits the API
// so it's slower. Item mutations trigger an out-of-band refetch (see below), so
// a just-created item due soon doesn't have to wait for this interval.
const TICK_MS = 15_000
const REFRESH_MS = 180_000
// Coalesce bursts of mutations into a single refetch.
const MUTATION_REFRESH_DEBOUNCE_MS = 400
// Cap simultaneous toasts so a burst of same-minute deadlines can't bury the UI.
// Oldest is dropped past this; each stays until the user dismisses it.
const MAX_TOASTS = 5

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

// Events recur, so an occurrence is identified by id + start; todos by id alone.
function keyFor(t: Todo): string {
  return t.type === 'event' ? `event-${t.id}-${t.due_date ?? 0}` : `todo-${t.id}`
}

/**
 * Watches the user's "due today" feed and fires a toast (plus a native OS
 * notification when the tab is backgrounded) the moment a todo/event reaches its
 * due time. Self-managing: it runs only while the user is authenticated AND the
 * `dueReminderToast` preference is on, and tears itself down on unmount.
 *
 * Only items crossing their deadline *while we're watching* fire — anything
 * already past due when first seen is silently marked handled, so opening the
 * app never retro-toasts stale deadlines.
 */
export function useDueReminders() {
  const authStore = useAuthStore()
  const settingsStore = useSettingsStore()
  const todoStore = useTodoStore()

  const toasts = ref<DueToast[]>([])

  // Items still ahead of their deadline: key -> the moment to fire at.
  const watching = new Map<string, { dueAt: number; item: Todo }>()
  // Keys already toasted (or already past-due on first sight) — never fire twice.
  const fired = new Set<string>()

  let refreshHandle: ReturnType<typeof setInterval> | null = null
  let tickHandle: ReturnType<typeof setInterval> | null = null
  let mutationRefreshHandle: ReturnType<typeof setTimeout> | null = null
  let running = false
  let seq = 0

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function emitDue(item: Todo) {
    const isEvent = item.type === 'event'
    const detail = isEvent ? 'Event · starts now' : 'Due now'
    const id = ++seq
    toasts.value = [
      ...toasts.value.slice(-(MAX_TOASTS - 1)),
      { id, title: item.title || 'Untitled', detail, kind: item.type },
    ]
    // A due reminder is important, so it stays until dismissed rather than
    // auto-vanishing. Also fire a native notification when the tab is hidden so
    // it reaches the user who isn't looking; when focused the in-app toast is
    // enough (no double-buzz).
    if (typeof document !== 'undefined' && document.hidden) {
      showNativeNotification(
        item.title || 'Untitled',
        isEvent ? 'Starting now' : 'Due now',
      )
    }
  }

  async function refresh() {
    let items: Todo[] = []
    try {
      const res = await apiFetch('/api/todos/today/all')
      const data = (await res.json()) as { todos?: Todo[] }
      items = Array.isArray(data.todos) ? data.todos : []
    } catch {
      return
    }
    const now = nowSec()
    const present = new Set<string>()
    for (const t of items) {
      // Need a concrete time-of-day: all-day items (stored at local midnight)
      // have no meaningful "moment" to buzz at, and completed items are done.
      if (t.due_date == null || t.all_day || t.status === 1) continue
      const key = keyFor(t)
      present.add(key)
      if (fired.has(key)) continue
      if (t.due_date <= now) {
        // Already due the first time we see it — handle without toasting.
        fired.add(key)
        continue
      }
      watching.set(key, { dueAt: t.due_date, item: t })
    }
    // Stop watching items that left the feed (completed, deleted, snoozed, moved
    // off today) so a since-removed deadline never fires.
    for (const key of [...watching.keys()]) {
      if (!present.has(key)) watching.delete(key)
    }
  }

  function tick() {
    const now = nowSec()
    for (const [key, entry] of watching) {
      if (entry.dueAt <= now) {
        watching.delete(key)
        fired.add(key)
        emitDue(entry.item)
      }
    }
  }

  function start() {
    if (running) return
    running = true
    void refresh()
    refreshHandle = setInterval(() => void refresh(), REFRESH_MS)
    tickHandle = setInterval(tick, TICK_MS)
  }

  function stop() {
    running = false
    if (refreshHandle) clearInterval(refreshHandle)
    if (tickHandle) clearInterval(tickHandle)
    if (mutationRefreshHandle) clearTimeout(mutationRefreshHandle)
    refreshHandle = null
    tickHandle = null
    mutationRefreshHandle = null
    watching.clear()
    fired.clear()
    toasts.value = []
  }

  const active = computed(
    () => authStore.isAuthenticated && settingsStore.dueReminderToast,
  )
  watch(active, (on) => (on ? start() : stop()), { immediate: true })

  // Adding/editing an item can create a deadline that's minutes — or seconds —
  // away, sooner than the safety-net interval would catch. Refetch (debounced)
  // whenever the store reports a mutation so the new item joins the watch list
  // before its moment passes. Also drops items completed before they were due.
  watch(
    () => todoStore.changeVersion,
    () => {
      if (!running) return
      if (mutationRefreshHandle) clearTimeout(mutationRefreshHandle)
      mutationRefreshHandle = setTimeout(() => void refresh(), MUTATION_REFRESH_DEBOUNCE_MS)
    },
  )

  onUnmounted(stop)

  return { toasts, dismiss }
}
