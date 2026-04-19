import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'

export const useListStore = defineStore('lists', () => {
  const lists = ref<string[]>([])
  const activeList = ref<string>('todos')
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Reorder `names` according to `order`; unknown names are appended in their original order. */
  function applyOrder(names: string[], order: string[]): string[] {
    const set = new Set(names)
    const ordered = order.filter((n) => set.has(n))
    const seen = new Set(ordered)
    const rest = names.filter((n) => !seen.has(n))
    return [...ordered, ...rest]
  }

  async function fetchLists() {
    loading.value = true
    error.value = null
    try {
      const [listsRes, orderRes, activeRes] = await Promise.all([
        apiFetch('/api/lists'),
        apiFetch('/api/settings/list-order'),
        apiFetch('/api/settings/active-list'),
      ])
      if (!listsRes.ok) return
      const { lists: fetched } = await listsRes.json() as { lists: string[] }
      const savedOrder = orderRes.ok
        ? ((await orderRes.json()) as { order: string[] }).order
        : []
      const savedActive = activeRes.ok
        ? ((await activeRes.json()) as { activeList: string | null }).activeList
        : null
      lists.value = applyOrder(fetched, savedOrder)
      if (savedActive && lists.value.includes(savedActive)) {
        activeList.value = savedActive
      } else if (lists.value.length > 0 && !lists.value.includes(activeList.value)) {
        activeList.value = lists.value[0]
      }
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  async function saveActiveList() {
    try {
      await apiFetch('/api/settings/active-list', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeList: activeList.value }),
      })
    } catch (e) {
      error.value = String(e)
    }
  }

  function setActiveList(name: string) {
    if (activeList.value === name) return
    activeList.value = name
    void saveActiveList()
  }

  async function saveOrder() {
    try {
      await apiFetch('/api/settings/list-order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: lists.value }),
      })
    } catch (e) {
      error.value = String(e)
    }
  }

  /** Persist the current `lists` ordering. Call after a drag completes. */
  async function reorderLists(newOrder: string[]) {
    lists.value = newOrder
    await saveOrder()
  }

  async function renameList(oldName: string, newName: string) {
    try {
      const res = await apiFetch(`/api/lists/${encodeURIComponent(oldName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      if (!res.ok) return
      const idx = lists.value.indexOf(oldName)
      if (idx !== -1) lists.value[idx] = newName
      if (activeList.value === oldName) {
        activeList.value = newName
        void saveActiveList()
      }
      await saveOrder()
    } catch (e) {
      error.value = String(e)
    }
  }

  async function deleteList(name: string) {
    try {
      await apiFetch(`/api/lists/${encodeURIComponent(name)}`, { method: 'DELETE' })
      lists.value = lists.value.filter((l) => l !== name)
      if (activeList.value === name) {
        activeList.value = lists.value[0] ?? 'todos'
        void saveActiveList()
      }
      await saveOrder()
    } catch (e) {
      error.value = String(e)
    }
  }

  // Creates a list by adding a placeholder todo then deleting it, but in practice
  // we rely on the server creating the list when a todo is added to it.
  // Just update the local list for immediate UI feedback.
  function addListLocally(name: string) {
    if (!lists.value.includes(name)) {
      lists.value.push(name)
      void saveOrder()
    }
  }

  return { lists, activeList, loading, error, fetchLists, setActiveList, reorderLists, renameList, deleteList, addListLocally }
})
