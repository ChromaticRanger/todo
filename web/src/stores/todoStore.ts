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

  // Per-list cache to avoid redundant DB calls
  const todosCache = new Map<string, Map<ViewType, Todo[]>>()
  const categoriesCache = new Map<string, string[]>()

  function invalidateList(list: string) {
    todosCache.delete(list)
    categoriesCache.delete(list)
  }

  // Group todos by category
  const byCategory = computed(() => {
    const map = new Map<string, Todo[]>()
    for (const t of todos.value) {
      const cat = t.category || 'General'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(t)
    }
    // Sort categories alphabetically, keeping General first
    const sorted = new Map<string, Todo[]>()
    const keys = [...map.keys()].sort((a, b) => {
      if (a === 'General') return -1
      if (b === 'General') return 1
      return a.localeCompare(b)
    })
    for (const k of keys) sorted.set(k, map.get(k)!)
    return sorted
  })

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
      const data = await res.json() as { categories: string[] }
      categoriesCache.set(list, data.categories)
      categories.value = data.categories
    } catch {
      // non-fatal, leave existing categories
    }
  }

  async function fetchTodos(list: string, view: ViewType = 'all') {
    currentList.value = list
    currentView.value = view

    const cachedTodos = todosCache.get(list)?.get(view)
    if (cachedTodos !== undefined) {
      todos.value = cachedTodos
      fetchCategories(list)
      return
    }

    loading.value = true
    error.value = null
    fetchCategories(list)
    try {
      const url = view === 'completed'
        ? `/api/todos/completed?list=${encodeURIComponent(list)}`
        : buildUrl(list, view)

      const statusParam = view === 'all' ? '&status=0' : ''
      const res = await apiFetch(url + statusParam)
      const data = await res.json() as { todos: Todo[] }
      todos.value = data.todos
      if (!todosCache.has(list)) todosCache.set(list, new Map())
      todosCache.get(list)!.set(view, data.todos)
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  async function addTodo(list: string, form: TodoFormData) {
    const res = await apiFetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_name: list, ...form }),
    })
    if (!res.ok) throw new Error(await res.text())
    invalidateList(list)
    await fetchTodos(list, currentView.value)
  }

  async function updateTodo(id: number, form: Partial<TodoFormData>) {
    const res = await apiFetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!res.ok) throw new Error(await res.text())
    invalidateList(currentList.value)
    await fetchTodos(currentList.value, currentView.value)
  }

  async function deleteTodo(id: number) {
    const res = await apiFetch(`/api/todos/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(await res.text())
    todos.value = todos.value.filter((t) => t.id !== id)
    invalidateList(currentList.value)
  }

  async function completeTodo(id: number) {
    const res = await apiFetch(`/api/todos/${id}/complete?list=${encodeURIComponent(currentList.value)}`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error(await res.text())
    invalidateList(currentList.value)
    await fetchTodos(currentList.value, currentView.value)
  }

  async function uncompleteTodo(id: number) {
    const res = await apiFetch(`/api/todos/${id}/uncomplete?list=${encodeURIComponent(currentList.value)}`, {
      method: 'POST',
    })
    if (!res.ok) throw new Error(await res.text())
    invalidateList(currentList.value)
    await fetchTodos(currentList.value, currentView.value)
  }

  async function moveTodo(id: number, targetList: string) {
    const res = await apiFetch(`/api/todos/${id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_list: targetList }),
    })
    if (!res.ok) throw new Error(await res.text())
    todos.value = todos.value.filter((t) => t.id !== id)
    invalidateList(currentList.value)
    invalidateList(targetList)
  }

  async function renameCategory(list: string, oldName: string, newName: string) {
    const res = await apiFetch('/api/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list, oldName, newName }),
    })
    if (!res.ok) throw new Error(await res.text())
    invalidateList(list)
    await fetchTodos(list, currentView.value)
  }

  function setView(view: ViewType) {
    currentView.value = view
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
    renameCategory,
    setView,
  }
})
