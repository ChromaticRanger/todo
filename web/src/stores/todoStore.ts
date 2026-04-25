import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Todo, TodoFormData, ViewType } from '../types/todo'
import { apiFetch } from '../lib/api'

export const useTodoStore = defineStore('todos', () => {
  const todos = ref<Todo[]>([])
  const categories = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentView = ref<ViewType>('all')
  const currentList = ref<string>('todos')
  const categoryOrder = ref<Record<string, string[]>>({})
  const emptyCategories = ref<Record<string, string[]>>({})
  let categoryOrderLoaded = false
  let emptyCategoriesLoaded = false

  // Per-list cache to avoid redundant DB calls
  const todosCache = new Map<string, Map<ViewType, Todo[]>>()
  const categoriesCache = new Map<string, string[]>()

  function invalidateList(list: string) {
    todosCache.delete(list)
    categoriesCache.delete(list)
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

  /** Default sort: 'General' first, then alphabetical. */
  function defaultCategorySort(keys: string[]): string[] {
    return [...keys].sort((a, b) => {
      if (a === 'General') return -1
      if (b === 'General') return 1
      return a.localeCompare(b)
    })
  }

  // Group todos by category, ordered by user preference (with reconciliation
  // for new categories not yet in the saved order).
  const byCategory = computed(() => {
    const map = new Map<string, Todo[]>()
    for (const t of todos.value) {
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
    for (const k of [...ordered, ...remaining]) sorted.set(k, map.get(k)!)
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
    return `${base}?list=${encodeURIComponent(list)}`
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
      const url = view === 'completed'
        ? `/api/todos/completed?list=${encodeURIComponent(list)}`
        : buildUrl(list, view)

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

  // Drop cached views for `list` except the one currently displayed — their
  // filters may differ from what we patched locally, so they'll refetch on
  // next visit. The current view's cache entry shares a reference with
  // `todos.value`, so in-place mutations below keep it in sync automatically.
  function invalidateOtherViews(list: string) {
    const listCache = todosCache.get(list)
    if (!listCache) return
    const keep = list === currentList.value ? currentView.value : null
    for (const view of [...listCache.keys()]) {
      if (view !== keep) listCache.delete(view)
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
    }

    if (list === currentList.value) todos.value.push(newTodo)
    registerCategory(list, cat)
    invalidateOtherViews(list)
  }

  async function updateTodo(id: number, form: Partial<TodoFormData>) {
    const res = await apiFetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) throw new Error(await res.text())

    const item = todos.value.find((t) => t.id === id)
    if (item) {
      if (form.title !== undefined) item.title = form.title
      if (form.description !== undefined) item.description = form.description
      if (form.category !== undefined) item.category = form.category || 'General'
      if (form.priority !== undefined) item.priority = form.priority
      if ('due_date' in form) item.due_date = form.due_date ?? null
      if ('url' in form) item.url = form.url ?? null
    }
    if (form.category) registerCategory(currentList.value, form.category || 'General')
    invalidateOtherViews(currentList.value)
  }

  async function deleteTodo(id: number) {
    const res = await apiFetch(`/api/todos/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    todos.value = todos.value.filter((t) => t.id !== id)
    invalidateList(currentList.value)
  }

  async function completeTodo(id: number) {
    const list = currentList.value
    const view = currentView.value
    const index = todos.value.findIndex((t) => t.id === id)
    const removed = index >= 0 ? todos.value[index] : null
    const isRepeating = !!removed && (removed.repeat_days > 0 || removed.repeat_months > 0)

    // Optimistic: remove from current view (all non-'completed' views filter status=0).
    if (index >= 0 && view !== 'completed') todos.value.splice(index, 1)

    try {
      const res = await apiFetch(`/api/todos/${id}/complete?list=${encodeURIComponent(list)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (e) {
      if (removed && index >= 0 && view !== 'completed') todos.value.splice(index, 0, removed)
      throw e
    }
    invalidateOtherViews(list)
    // Repeating todos may spawn a new row on the server — pull it in without a flash.
    if (isRepeating && view !== 'completed') {
      todosCache.get(list)?.delete(view)
      await fetchTodos(list, view, { silent: true })
    }
  }

  async function uncompleteTodo(id: number) {
    const list = currentList.value
    const view = currentView.value
    const index = todos.value.findIndex((t) => t.id === id)
    const removed = index >= 0 ? todos.value[index] : null

    // Optimistic: only the 'completed' view filters status=1, so remove there.
    if (index >= 0 && view === 'completed') todos.value.splice(index, 1)

    try {
      const res = await apiFetch(`/api/todos/${id}/uncomplete?list=${encodeURIComponent(list)}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (e) {
      if (removed && index >= 0 && view === 'completed') todos.value.splice(index, 0, removed)
      throw e
    }
    invalidateOtherViews(list)
  }

  async function moveTodo(id: number, targetList: string, targetCategory?: string) {
    const body: { target_list: string; target_category?: string } = { target_list: targetList }
    if (targetCategory && targetCategory.trim()) body.target_category = targetCategory.trim()
    const res = await apiFetch(`/api/todos/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      await surfaceCapError(res)
      return
    }
    invalidateList(currentList.value)
    invalidateList(targetList)
    if (targetList === currentList.value) {
      // Same list, (possibly) different category — mutate in place so byCategory regroups.
      const cat = body.target_category
      if (cat) {
        const item = todos.value.find((t) => t.id === id)
        if (item) {
          item.category = cat
          if (!categories.value.includes(cat)) categories.value = [...categories.value, cat]
        }
      }
    } else {
      todos.value = todos.value.filter((t) => t.id !== id)
    }
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
  }

  return {
    todos,
    categories,
    loading,
    error,
    currentView,
    currentList,
    byCategory,
    fetchTodos,
    addTodo,
    updateTodo,
    deleteTodo,
    completeTodo,
    uncompleteTodo,
    moveTodo,
    fetchCategoriesFor,
    renameCategory,
    reorderCategories,
    createCategory,
    deleteCategory,
    mergeCategory,
    setView,
    reset,
  }
})
