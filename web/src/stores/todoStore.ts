import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Todo, TodoFormData, ViewType } from '../types/todo'
import { apiFetch } from '../lib/api'
import { useCategoryPrefsStore } from './categoryPrefsStore'
import { useSettingsStore, type CompletedWindow, type ListScope, type WindowedView } from './settingsStore'

export const useTodoStore = defineStore('todos', () => {
  const categoryPrefsStore = useCategoryPrefsStore()
  const settingsStore = useSettingsStore()
  const todos = ref<Todo[]>([])
  const categories = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentView = ref<ViewType>('all')
  const currentList = ref<string>('todos')
  // True when the most recent /completed fetch was clipped by the server cap —
  // surfaces a "narrow the range" hint in the UI.
  const completedHasMore = ref(false)
  // Exact count of items in the current window (independent of limit), so the
  // UI can show a count even when the row list is clipped.
  const completedTotal = ref(0)
  const viewCounts = ref<{ today: number; week: number; month: number; overdue: number }>({
    today: 0, week: 0, month: 0, overdue: 0,
  })
  const categoryOrder = ref<Record<string, string[]>>({})
  const emptyCategories = ref<Record<string, string[]>>({})
  // Bumped whenever an event is created so the Overall Schedule can refetch
  // its calendar feed without depending on view/list state.
  const eventsVersion = ref(0)
  // Bumped on every item mutation (add/edit/delete/snooze/toggle, todos and
  // events alike) so watchers can react promptly — e.g. the due-reminder loop
  // refetches its feed so a just-created item due soon is picked up in time.
  const changeVersion = ref(0)
  let categoryOrderLoaded = false
  let emptyCategoriesLoaded = false

  // Per-list cache to avoid redundant DB calls
  const todosCache = new Map<string, Map<ViewType, Todo[]>>()
  const categoriesCache = new Map<string, string[]>()
  // Completed view is keyed by window too, so toggling 30d↔All is instant
  // after the first fetch of each.
  const completedCache = new Map<string, Map<CompletedWindow, { todos: Todo[]; hasMore: boolean; total: number }>>()

  function invalidateList(list: string) {
    todosCache.delete(list)
    categoriesCache.delete(list)
    completedCache.delete(list)
  }

  // Events surface across every list's time-windowed views, so a mutation
  // (add/edit/delete) has to invalidate those views for *every* cached list,
  // not just the active one. Bumps eventsVersion so the calendar refetches,
  // refreshes counts, and silently refetches the current view if it's one of
  // the time-windowed views.
  const TIME_WINDOWED_VIEWS: ViewType[] = ['today', 'week', 'month', 'overdue']
  function notifyEventChanged() {
    eventsVersion.value++
    changeVersion.value++
    for (const listCache of todosCache.values()) {
      for (const view of TIME_WINDOWED_VIEWS) listCache.delete(view)
    }
    if (TIME_WINDOWED_VIEWS.includes(currentView.value)) {
      void fetchTodos(currentList.value, currentView.value, { silent: true })
    }
    void fetchViewCounts(currentList.value)
  }

  function setErrorWithTimeout(msg: string, ms = 6000) {
    error.value = msg
    setTimeout(() => {
      if (error.value === msg) error.value = null
    }, ms)
  }

  async function surfaceCapError(res: Response) {
    let body: { error?: string; limit?: number } | null = null
    try { body = await res.json() } catch { /* noop */ }
    if (body?.error === 'free_tier_item_limit') {
      setErrorWithTimeout(
        `You're at the Free plan item limit (${body.limit}). Delete an item or upgrade to Pro.`
      )
    } else if (body?.error === 'free_tier_list_limit') {
      setErrorWithTimeout(
        `You're at the Free plan list limit (${body.limit}). Remove a list or upgrade to Pro.`
      )
    } else {
      setErrorWithTimeout(`Error ${res.status}: ${body?.error ?? res.statusText}`)
    }
  }

  async function loadCategoryOrder() {
    if (categoryOrderLoaded) return
    categoryOrderLoaded = true
    try {
      const res = await apiFetch('/api/settings/category-order')
      if (!res.ok) return
      const data = await res.json() as { order: Record<string, string[]> }
      categoryOrder.value = data.order ?? {}
    } catch {
      // non-fatal
    }
  }

  async function loadEmptyCategories() {
    if (emptyCategoriesLoaded) return
    emptyCategoriesLoaded = true
    try {
      const res = await apiFetch('/api/settings/empty-categories')
      if (!res.ok) return
      const data = await res.json() as { empty: Record<string, string[]> }
      emptyCategories.value = data.empty ?? {}
    } catch {
      // non-fatal
    }
  }

  async function persistEmptyCategories() {
    try {
      await apiFetch('/api/settings/empty-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empty: emptyCategories.value }),
      })
    } catch (e) {
      error.value = String(e)
    }
  }

  /** Default sort: 'Welcome' first (onboarding content), 'General' second
   *  (the fallback bucket every user has), everything else alphabetical.
   *  Only applied to categories that don't have an explicit saved order. */
  function defaultCategorySort(keys: string[]): string[] {
    const rank = (k: string) => (k === 'Welcome' ? 0 : k === 'General' ? 1 : 2)
    return [...keys].sort((a, b) => {
      const ra = rank(a), rb = rank(b)
      if (ra !== rb) return ra - rb
      return a.localeCompare(b)
    })
  }

  // Events surface on time-windowed views (today/week/month/overdue)
  // but live outside any list-and-category scheme — render them in a dedicated
  // Events block above the category grid, never inside a category card.
  const eventsInView = computed(() => todos.value.filter((t) => t.type === 'event'))

  // Group todos by category, ordered by user preference (with reconciliation
  // for new categories not yet in the saved order).
  const byCategory = computed(() => {
    const map = new Map<string, Todo[]>()
    for (const t of todos.value) {
      if (t.type === 'event') continue
      const cat = t.category || 'General'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(t)
    }
    // Include explicitly-created empty categories so they render as empty cards.
    // Only on the 'all' view — time-filtered views (today/week/month) hide items
    // outside the window, so an empty placeholder there would be misleading
    // (e.g. a category whose only item is a bookmark looks empty in Today).
    if (currentView.value === 'all') {
      for (const cat of emptyCategories.value[currentList.value] ?? []) {
        if (!map.has(cat)) map.set(cat, [])
      }
    }
    const present = new Set(map.keys())
    const saved = categoryOrder.value[currentList.value] ?? []
    const ordered = saved.filter((c) => present.has(c))
    const seen = new Set(ordered)
    const remaining = defaultCategorySort([...present].filter((c) => !seen.has(c)))
    const sorted = new Map<string, Todo[]>()
    const listPrefs = categoryPrefsStore.prefs[currentList.value] ?? {}
    for (const k of [...ordered, ...remaining]) {
      const items = map.get(k)!
      const order = listPrefs[k]?.itemOrder ?? []
      const indexOf = new Map<number, number>()
      for (let i = 0; i < order.length; i++) indexOf.set(order[i], i)
      const known: Todo[] = []
      const unknown: Todo[] = []
      for (const t of items) {
        if (indexOf.has(t.id)) known.push(t)
        else unknown.push(t)
      }
      known.sort((a, b) => indexOf.get(a.id)! - indexOf.get(b.id)!)
      // Slot items not yet in the saved order by priority rather than dumping
      // them at the end: a High item floats to the top of the category, a Low
      // sinks to the bottom, and a Medium settles between the two. Equal-priority
      // items queue after their peers (stable insert). With no saved order this
      // reproduces the server's priority-sorted order while still placing a
      // freshly-added item at its correct spot instead of last.
      const result = known
      for (const t of unknown) {
        let idx = result.findIndex((r) => r.priority < t.priority)
        if (idx === -1) idx = result.length
        result.splice(idx, 0, t)
      }
      sorted.set(k, result)
    }
    return sorted
  })

  async function createCategory(list: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const current = emptyCategories.value[list] ?? []
    const existing = new Set([
      ...current,
      ...todos.value.filter((t) => t.list_name === list).map((t) => t.category || 'General'),
    ])
    if (existing.has(trimmed)) {
      setErrorWithTimeout(`Category "${trimmed}" already exists in this list.`)
      return
    }
    emptyCategories.value = {
      ...emptyCategories.value,
      [list]: [...current, trimmed],
    }
    registerCategory(list, trimmed)
    await persistEmptyCategories()
  }

  async function reorderCategories(list: string, newOrder: string[]) {
    categoryOrder.value = { ...categoryOrder.value, [list]: newOrder }
    try {
      await apiFetch('/api/settings/category-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: categoryOrder.value }),
      })
    } catch (e) {
      error.value = String(e)
    }
  }

  function buildUrl(list: string, view: ViewType): string {
    const base = view === 'all' ? '/api/todos' : `/api/todos/${view}`
    let url = `${base}?list=${encodeURIComponent(list)}`
    // Windowed views can opt into a cross-list scope; the server widens the
    // todo filter to every list when all=1 is present.
    if (
      TIME_WINDOWED_VIEWS.includes(view) &&
      settingsStore.filterScope[view as WindowedView] === 'all'
    ) {
      url += '&all=1'
    }
    return url
  }

  // Flip a windowed view between This List / All Lists. Scope is global per
  // view (it applies whatever list is active), so the cached entry for this
  // view is dropped on every list, then the active view refetches.
  function setListScope(view: ViewType, scope: ListScope) {
    if (!TIME_WINDOWED_VIEWS.includes(view)) return
    const wv = view as WindowedView
    if (settingsStore.filterScope[wv] === scope) return
    settingsStore.setFilterScope(wv, scope)
    for (const listCache of todosCache.values()) listCache.delete(view)
    if (currentView.value === view) {
      void fetchTodos(currentList.value, view)
    }
  }

  async function fetchViewCounts(list: string) {
    try {
      const res = await apiFetch(`/api/todos/counts?list=${encodeURIComponent(list)}`)
      if (!res.ok) return
      const data = await res.json() as {
        counts: { today: number; week: number; month: number; overdue: number }
      }
      viewCounts.value = data.counts
    } catch {
      // non-fatal — leave previous counts
    }
  }

  async function fetchCategories(list: string) {
    if (categoriesCache.has(list)) {
      categories.value = categoriesCache.get(list)!
      return
    }
    try {
      const res = await apiFetch(`/api/categories?list=${encodeURIComponent(list)}`)
      if (!res.ok) return
      const data = await res.json() as { categories: string[] }
      categoriesCache.set(list, data.categories)
      categories.value = data.categories
    } catch {
      // non-fatal, leave existing categories
    }
  }

  async function fetchTodos(list: string, view: ViewType = 'all', opts: { silent?: boolean } = {}) {
    currentList.value = list
    currentView.value = view

    loadCategoryOrder()
    loadEmptyCategories()
    fetchViewCounts(list)

    // Completed has its own per-window cache so toggling the dropdown is instant.
    if (view === 'completed') {
      const window = settingsStore.completedWindow as CompletedWindow
      const cached = completedCache.get(list)?.get(window)
      if (cached !== undefined) {
        todos.value = cached.todos
        completedHasMore.value = cached.hasMore
        completedTotal.value = cached.total
        fetchCategories(list)
        return
      }
      if (!opts.silent) loading.value = true
      error.value = null
      fetchCategories(list)
      try {
        const url = `/api/todos/completed?list=${encodeURIComponent(list)}&window=${window}`
        const res = await apiFetch(url)
        if (!res.ok) return
        const data = await res.json() as { todos: Todo[]; hasMore?: boolean; total?: number }
        const fetched = Array.isArray(data.todos) ? data.todos : []
        const hasMore = !!data.hasMore
        const total = typeof data.total === 'number' ? data.total : fetched.length
        todos.value = fetched
        completedHasMore.value = hasMore
        completedTotal.value = total
        if (!completedCache.has(list)) completedCache.set(list, new Map())
        completedCache.get(list)!.set(window, { todos: fetched, hasMore, total })
      } catch (e) {
        error.value = String(e)
      } finally {
        if (!opts.silent) loading.value = false
      }
      return
    }

    const cachedTodos = todosCache.get(list)?.get(view)
    if (cachedTodos !== undefined) {
      todos.value = cachedTodos
      fetchCategories(list)
      return
    }

    if (!opts.silent) loading.value = true
    error.value = null
    fetchCategories(list)
    try {
      const url = buildUrl(list, view)
      const statusParam = view === 'all' ? '&status=0' : ''
      const res = await apiFetch(url + statusParam)
      if (!res.ok) {
        // Non-OK (e.g. 429 rate limit). Keep existing todos; surface the error
        // once for rate-limits (the api layer already toasts) and bail.
        return
      }
      const data = await res.json() as { todos: Todo[] }
      todos.value = Array.isArray(data.todos) ? data.todos : []
      if (!todosCache.has(list)) todosCache.set(list, new Map())
      todosCache.get(list)!.set(view, todos.value)
    } catch (e) {
      error.value = String(e)
    } finally {
      if (!opts.silent) loading.value = false
    }
  }

  async function setCompletedWindow(w: CompletedWindow) {
    if (settingsStore.completedWindow === w) return
    settingsStore.setCompletedWindow(w)
    if (currentView.value === 'completed') {
      await fetchTodos(currentList.value, 'completed')
    }
  }

  // Drop cached views for `list` except the one currently displayed — their
  // filters may differ from what we patched locally, so they'll refetch on
  // next visit. The current view's cache entry shares a reference with
  // `todos.value`, so in-place mutations below keep it in sync automatically.
  function invalidateOtherViews(list: string) {
    changeVersion.value++
    const listCache = todosCache.get(list)
    if (listCache) {
      const keep = list === currentList.value ? currentView.value : null
      for (const view of [...listCache.keys()]) {
        if (view !== keep) listCache.delete(view)
      }
    }
    // Completed cache is keyed by window. If the user is currently on the
    // Completed view, keep only the active window's entry (it shares its
    // reference with todos.value); otherwise drop the whole list's bucket.
    const cListCache = completedCache.get(list)
    if (cListCache) {
      if (list === currentList.value && currentView.value === 'completed') {
        const active = settingsStore.completedWindow as CompletedWindow
        for (const w of [...cListCache.keys()]) {
          if (w !== active) cListCache.delete(w)
        }
      } else {
        completedCache.delete(list)
      }
    }
  }

  function registerCategory(list: string, cat: string) {
    if (list === currentList.value && !categories.value.includes(cat)) {
      categories.value = [...categories.value, cat]
    }
    const cached = categoriesCache.get(list)
    if (cached && !cached.includes(cat)) {
      categoriesCache.set(list, [...cached, cat])
    }
  }

  async function addTodo(list: string, form: TodoFormData) {
    const res = await apiFetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_name: list, ...form }),
    })
    if (!res.ok) {
      await surfaceCapError(res)
      return
    }
    const { id } = await res.json() as { id: number }

    // Events live outside lists — purge time-windowed view caches across
    // every list, refresh counts, and nudge the calendar to refetch.
    if (form.type === 'event') {
      notifyEventChanged()
      return
    }

    const now = Math.floor(Date.now() / 1000)
    // Mirrors server default: a repeating todo with no due date starts today.
    const effectiveDue =
      form.due_date ?? ((form.repeat_days > 0 || form.repeat_months > 0) ? now : null)
    const cat = form.category || 'General'
    const newTodo: Todo = {
      id,
      list_name: list,
      title: form.title,
      description: form.description,
      category: cat,
      priority: form.priority,
      status: 0,
      created_at: now,
      completed_at: null,
      due_date: effectiveDue,
      repeat_days: form.repeat_days,
      repeat_months: form.repeat_months,
      spawned_next: 0,
      type: form.type,
      url: form.url,
      snoozed_until: null,
      recur_until: null,
      duration_seconds: null,
      color: form.color ?? null,
      all_day: form.all_day ?? false,
    }

    if (list === currentList.value) todos.value.push(newTodo)
    registerCategory(list, cat)
    invalidateOtherViews(list)
    fetchViewCounts(list)
  }

  async function snoozeTodo(id: number, snoozedUntil: number | null, dueDate?: number | null) {
    const list = currentList.value
    const view = currentView.value
    const index = todos.value.findIndex((t) => t.id === id)
    const removed = index >= 0 ? todos.value[index] : null

    // Optimistic: only the category ('all') view filters snoozed items server-side.
    // Snoozing on 'all' removes the row; on time-based views the row stays visible
    // and we just patch the field. Unsnoozing (snoozedUntil === null) just patches —
    // the row was always visible on time-based views.
    if (index >= 0) {
      if (view === 'all' && snoozedUntil != null) {
        todos.value.splice(index, 1)
      } else {
        todos.value[index].snoozed_until = snoozedUntil
        if (dueDate !== undefined) todos.value[index].due_date = dueDate
      }
    }

    const body: { snoozed_until: number | null; due_date?: number | null } = {
      snoozed_until: snoozedUntil,
    }
    if (dueDate !== undefined) body.due_date = dueDate

    try {
      const res = await apiFetch(`/api/todos/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (e) {
      if (removed && index >= 0 && view === 'all' && snoozedUntil != null) {
        todos.value.splice(index, 0, removed)
      }
      throw e
    }
    invalidateOtherViews(list)
    // The snoozed row may belong to another list (All Lists windowed view).
    if (removed && removed.list_name !== list) invalidateList(removed.list_name)
    fetchViewCounts(list)
  }

  async function updateTodo(id: number, form: Partial<TodoFormData>) {
    const res = await apiFetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) throw new Error(await res.text())

    const item = todos.value.find((t) => t.id === id)
    const prevPriority = item?.priority
    if (item) {
      if (form.title !== undefined) item.title = form.title
      if (form.description !== undefined) item.description = form.description
      if (form.category !== undefined) item.category = form.category || 'General'
      if (form.priority !== undefined) item.priority = form.priority
      if ('due_date' in form) item.due_date = form.due_date ?? null
      if ('url' in form) item.url = form.url ?? null
      if ('color' in form) item.color = form.color ?? null
      if ('all_day' in form) item.all_day = form.all_day ?? false
    }
    // A changed priority should re-slot the item like a freshly-added one. In a
    // category with no saved manual order byCategory already re-slots reactively;
    // when a manual order pins the item, drop it from that order so byCategory
    // treats it as unplaced and re-inserts it at its new priority position.
    if (item && form.priority !== undefined && form.priority !== prevPriority) {
      const order = categoryPrefsStore.prefs[currentList.value]?.[item.category]?.itemOrder
      if (order?.includes(id)) {
        void categoryPrefsStore.setItemOrder(
          currentList.value,
          item.category,
          order.filter((x) => x !== id),
        )
      }
    }
    if (form.category) registerCategory(currentList.value, form.category || 'General')
    invalidateOtherViews(currentList.value)
    // The edited row may belong to another list (All Lists windowed view); drop
    // that list's cache so its views pick up the change on next visit.
    if (item && item.list_name !== currentList.value) invalidateList(item.list_name)

    // Time-windowed views (today/week/month/overdue) filter by due_date,
    // so a changed due_date may push the item in or out of view. Refetch silently.
    const view = currentView.value
    const list = currentList.value
    const isWindowed = view === 'today' || view === 'week' || view === 'month'
      || view === 'overdue'
    if ('due_date' in form && isWindowed) {
      todosCache.get(list)?.delete(view)
      await fetchTodos(list, view, { silent: true })
    }
    if ('due_date' in form) fetchViewCounts(list)
  }

  async function deleteTodo(id: number) {
    const res = await apiFetch(`/api/todos/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    const removed = todos.value.find((t) => t.id === id)
    todos.value = todos.value.filter((t) => t.id !== id)
    invalidateList(currentList.value)
    // In an All Lists windowed view the deleted row may belong to another list;
    // drop that list's cache too so it doesn't resurrect on next visit.
    if (removed && removed.list_name !== currentList.value) invalidateList(removed.list_name)
    // Keep the Completed dropdown count in sync when deleting from there.
    // invalidateList wiped the cached entries, so we only need the ref.
    if (currentView.value === 'completed' && removed?.status === 1) {
      completedTotal.value = Math.max(0, completedTotal.value - 1)
    }
    fetchViewCounts(currentList.value)
  }

  async function completeTodo(id: number) {
    const list = currentList.value
    const view = currentView.value
    const index = todos.value.findIndex((t) => t.id === id)
    const removed = index >= 0 ? todos.value[index] : null
    const isRepeating = !!removed && (removed.repeat_days > 0 || removed.repeat_months > 0)
    // The All Lists windowed views surface todos from other lists, so target the
    // item's own list — the complete route filters on list_name.
    const itemList = removed?.list_name ?? list

    // Optimistic: remove from current view (all non-'completed' views filter status=0).
    if (index >= 0 && view !== 'completed') todos.value.splice(index, 1)

    try {
      const res = await apiFetch(`/api/todos/${id}/complete?list=${encodeURIComponent(itemList)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (e) {
      if (removed && index >= 0 && view !== 'completed') todos.value.splice(index, 0, removed)
      throw e
    }
    invalidateOtherViews(list)
    if (itemList !== list) invalidateList(itemList)
    // Repeating todos may spawn a new row on the server — pull it in without a flash.
    if (isRepeating && view !== 'completed') {
      todosCache.get(list)?.delete(view)
      await fetchTodos(list, view, { silent: true })
    }
    fetchViewCounts(list)
  }

  async function uncompleteTodo(id: number) {
    const list = currentList.value
    const view = currentView.value
    const index = todos.value.findIndex((t) => t.id === id)
    const removed = index >= 0 ? todos.value[index] : null
    // Target the item's own list — uncomplete filters on list_name and the row
    // may belong to another list when surfaced in an All Lists windowed view.
    const itemList = removed?.list_name ?? list

    // Optimistic: only the 'completed' view filters status=1, so remove there.
    if (index >= 0 && view === 'completed') todos.value.splice(index, 1)

    try {
      const res = await apiFetch(`/api/todos/${id}/uncomplete?list=${encodeURIComponent(itemList)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (e) {
      if (removed && index >= 0 && view === 'completed') todos.value.splice(index, 0, removed)
      throw e
    }
    invalidateOtherViews(list)
    if (itemList !== list) invalidateList(itemList)
    // Keep the Completed dropdown count and active-window cache total in sync.
    if (view === 'completed') {
      completedTotal.value = Math.max(0, completedTotal.value - 1)
      const active = settingsStore.completedWindow as CompletedWindow
      const entry = completedCache.get(list)?.get(active)
      if (entry) entry.total = Math.max(0, entry.total - 1)
    }
    fetchViewCounts(list)
  }

  async function moveTodo(id: number, targetList: string, targetCategory?: string) {
    const body: { target_list: string; target_category?: string } = { target_list: targetList }
    if (targetCategory && targetCategory.trim()) body.target_category = targetCategory.trim()

    // Optimistic in-memory update first so drag-and-drop reflects instantly.
    let revert: (() => void) | null = null
    const item = todos.value.find((t) => t.id === id)
    if (item) {
      if (targetList === currentList.value) {
        const cat = body.target_category
        if (cat && cat !== item.category) {
          const oldCategory = item.category
          item.category = cat
          const addedCat = !categories.value.includes(cat)
          if (addedCat) categories.value = [...categories.value, cat]
          revert = () => {
            item.category = oldCategory
            if (addedCat) categories.value = categories.value.filter((c) => c !== cat)
          }
        }
      } else {
        const idx = todos.value.indexOf(item)
        todos.value = todos.value.filter((t) => t.id !== id)
        revert = () => {
          const next = [...todos.value]
          next.splice(idx, 0, item)
          todos.value = next
        }
      }
    }

    const res = await apiFetch(`/api/todos/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      revert?.()
      await surfaceCapError(res)
      return
    }
    invalidateList(currentList.value)
    invalidateList(targetList)
    // viewCounts tracks the active list — moving away or staying both affect its
    // counts (item left, or category-only change is a no-op for counts).
    fetchViewCounts(currentList.value)
  }

  async function fetchCategoriesFor(list: string): Promise<string[]> {
    if (categoriesCache.has(list)) return categoriesCache.get(list)!
    try {
      const res = await apiFetch(`/api/categories?list=${encodeURIComponent(list)}`)
      if (!res.ok) return []
      const data = await res.json() as { categories: string[] }
      categoriesCache.set(list, data.categories)
      return data.categories
    } catch {
      return []
    }
  }

  async function mergeCategory(list: string, fromName: string, toName: string) {
    if (fromName === toName) return
    const res = await apiFetch('/api/categories/move-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list, fromName, toName }),
    })
    if (!res.ok) {
      setErrorWithTimeout(`Failed to move items: ${res.statusText}`)
      return
    }

    // Drop fromName from persisted empty-categories / order settings.
    const savedEmpty = emptyCategories.value[list] ?? []
    if (savedEmpty.includes(fromName)) {
      emptyCategories.value = {
        ...emptyCategories.value,
        [list]: savedEmpty.filter((c) => c !== fromName),
      }
      await persistEmptyCategories()
    }
    const savedOrder = categoryOrder.value[list]
    if (savedOrder?.includes(fromName)) {
      // Drop fromName; if toName is absent from order, drop it entirely too so
      // it picks up the default sort position rather than inheriting fromName's slot.
      const next = savedOrder.filter((c) => c !== fromName)
      await reorderCategories(list, next)
    }
    await categoryPrefsStore.clearCategory(list, fromName)

    // In-memory: reassign todos and drop the old category name.
    if (list === currentList.value) {
      for (const t of todos.value) {
        if (t.category === fromName) t.category = toName
      }
      if (!categories.value.includes(toName)) categories.value = [...categories.value, toName]
      categories.value = categories.value.filter((c) => c !== fromName)
    }
    invalidateList(list)
  }

  async function deleteCategory(list: string, name: string) {
    // Remove all todos in this category (server-side bulk delete).
    const res = await apiFetch('/api/categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list, name }),
    })
    if (!res.ok) {
      setErrorWithTimeout(`Failed to delete category: ${res.statusText}`)
      return
    }

    // Drop from the persisted empty-categories set.
    const savedEmpty = emptyCategories.value[list] ?? []
    if (savedEmpty.includes(name)) {
      const next = savedEmpty.filter((c) => c !== name)
      emptyCategories.value = { ...emptyCategories.value, [list]: next }
      await persistEmptyCategories()
    }

    // Drop from the persisted category order so it doesn't resurrect on reorder.
    const savedOrder = categoryOrder.value[list]
    if (savedOrder?.includes(name)) {
      const next = savedOrder.filter((c) => c !== name)
      await reorderCategories(list, next)
    }
    await categoryPrefsStore.clearCategory(list, name)

    // Purge in-memory todos + caches (invalidateList drops todos/categories caches).
    if (list === currentList.value) {
      todos.value = todos.value.filter((t) => t.category !== name)
    }
    categories.value = categories.value.filter((c) => c !== name)
    invalidateList(list)
  }

  async function renameCategory(list: string, oldName: string, newName: string) {
    const res = await apiFetch('/api/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list, oldName, newName }),
    })
    if (!res.ok) throw new Error(await res.text())
    const saved = categoryOrder.value[list]
    if (saved) {
      const next = saved.map((c) => (c === oldName ? newName : c))
      await reorderCategories(list, next)
    }
    const savedEmpty = emptyCategories.value[list]
    if (savedEmpty?.includes(oldName)) {
      emptyCategories.value = {
        ...emptyCategories.value,
        [list]: savedEmpty.map((c) => (c === oldName ? newName : c)),
      }
      await persistEmptyCategories()
    }
    await categoryPrefsStore.renamePrefCategory(list, oldName, newName)
    invalidateList(list)
    await fetchTodos(list, currentView.value)
  }

  function setView(view: ViewType) {
    currentView.value = view
  }

  function reset() {
    todos.value = []
    categories.value = []
    error.value = null
    currentView.value = 'all'
    currentList.value = 'todos'
    categoryOrder.value = {}
    categoryOrderLoaded = false
    emptyCategories.value = {}
    emptyCategoriesLoaded = false
    todosCache.clear()
    categoriesCache.clear()
    completedCache.clear()
    completedHasMore.value = false
    completedTotal.value = 0
    viewCounts.value = { today: 0, week: 0, month: 0, overdue: 0 }
  }

  return {
    todos,
    categories,
    loading,
    error,
    currentView,
    currentList,
    viewCounts,
    completedHasMore,
    completedTotal,
    eventsVersion,
    changeVersion,
    eventsInView,
    byCategory,
    notifyEventChanged,
    fetchTodos,
    setCompletedWindow,
    setListScope,
    addTodo,
    updateTodo,
    deleteTodo,
    completeTodo,
    uncompleteTodo,
    snoozeTodo,
    moveTodo,
    fetchCategoriesFor,
    renameCategory,
    reorderCategories,
    createCategory,
    deleteCategory,
    mergeCategory,
    setView,
    reset,
    invalidateList,
  }
})
