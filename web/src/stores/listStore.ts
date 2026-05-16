import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'

export const useListStore = defineStore('lists', () => {
  const lists = ref<string[]>([])
  // Lists with no todos yet — server can't materialize them via DISTINCT, so
  // we keep them in app_settings.empty_lists and union them in on fetch.
  // Entries self-clean once the list gets a real item.
  const emptyLists = ref<string[]>([])
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
      const [listsRes, orderRes, activeRes, emptyRes] = await Promise.all([
        apiFetch('/api/lists'),
        apiFetch('/api/settings/list-order'),
        apiFetch('/api/settings/active-list'),
        apiFetch('/api/settings/empty-lists'),
      ])
      if (!listsRes.ok) return
      const { lists: fetched } = await listsRes.json() as { lists: string[] }
      const savedOrder = orderRes.ok
        ? ((await orderRes.json()) as { order: string[] }).order
        : []
      const savedActive = activeRes.ok
        ? ((await activeRes.json()) as { activeList: string | null }).activeList
        : null
      const savedEmpty = emptyRes.ok
        ? ((await emptyRes.json()) as { empty: string[] }).empty
        : []

      // Any name in saved-empty that now has todos on the server should be
      // pruned — the empty-lists set is only for lists with no real items.
      const fetchedSet = new Set(fetched)
      const pruned = savedEmpty.filter((n) => !fetchedSet.has(n))
      emptyLists.value = pruned
      if (pruned.length !== savedEmpty.length) {
        void persistEmptyLists()
      }

      // Merge: real lists + still-empty lists, then apply saved order.
      const seen = new Set(fetched)
      const combined = [...fetched, ...pruned.filter((n) => !seen.has(n))]
      lists.value = applyOrder(combined, savedOrder)

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

  async function persistEmptyLists() {
    try {
      await apiFetch('/api/settings/empty-lists', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empty: emptyLists.value }),
      })
    } catch (e) {
      error.value = String(e)
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
      const emptyIdx = emptyLists.value.indexOf(oldName)
      if (emptyIdx !== -1) {
        emptyLists.value[emptyIdx] = newName
        void persistEmptyLists()
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
      if (emptyLists.value.includes(name)) {
        emptyLists.value = emptyLists.value.filter((l) => l !== name)
        void persistEmptyLists()
      }
      if (activeList.value === name) {
        activeList.value = lists.value[0] ?? 'todos'
        void saveActiveList()
      }
      await saveOrder()
    } catch (e) {
      error.value = String(e)
    }
  }

  // Server can't create a list without a todo (lists are derived from
  // DISTINCT list_name), so we add the name to lists for immediate UI
  // feedback AND persist it in app_settings.empty_lists so it survives a
  // refresh. fetchLists prunes the entry once the list has real items.
  function addListLocally(name: string) {
    if (!lists.value.includes(name)) {
      lists.value.push(name)
      void saveOrder()
    }
    if (!emptyLists.value.includes(name)) {
      emptyLists.value.push(name)
      void persistEmptyLists()
    }
  }

  function reset() {
    lists.value = []
    emptyLists.value = []
    activeList.value = 'todos'
    error.value = null
  }

  return { lists, activeList, loading, error, fetchLists, setActiveList, reorderLists, renameList, deleteList, addListLocally, reset }
})
