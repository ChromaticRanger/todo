import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Todo } from '../types/todo'
import { apiFetch } from '../lib/api'

const DEBOUNCE_MS = 200

export const useSearchStore = defineStore('search', () => {
  const open = ref(false)
  const query = ref('')
  const results = ref<Todo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const truncated = ref(false)

  let inflight: AbortController | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function runSearch(q: string) {
    const trimmed = q.trim()
    if (trimmed.length < 2) {
      results.value = []
      truncated.value = false
      loading.value = false
      error.value = null
      return
    }

    inflight?.abort()
    const ctrl = new AbortController()
    inflight = ctrl

    loading.value = true
    error.value = null
    try {
      const res = await apiFetch(
        `/api/search?q=${encodeURIComponent(trimmed)}&limit=50`,
        { signal: ctrl.signal }
      )
      if (ctrl.signal.aborted) return
      if (!res.ok) {
        error.value = `Search failed (${res.status})`
        results.value = []
        truncated.value = false
        return
      }
      const data = (await res.json()) as {
        results: Todo[]
        total: number
        truncated: boolean
      }
      results.value = data.results
      truncated.value = data.truncated
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return
      error.value = String(e)
    } finally {
      if (inflight === ctrl) {
        inflight = null
        loading.value = false
      }
    }
  }

  function setQuery(q: string) {
    query.value = q
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runSearch(q)
    }, DEBOUNCE_MS)
  }

  function openSearch() {
    open.value = true
  }

  function closeSearch() {
    open.value = false
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    inflight?.abort()
    inflight = null
    query.value = ''
    results.value = []
    truncated.value = false
    loading.value = false
    error.value = null
  }

  function reset() {
    closeSearch()
  }

  return {
    open,
    query,
    results,
    loading,
    error,
    truncated,
    setQuery,
    runSearch,
    openSearch,
    closeSearch,
    reset,
  }
})
