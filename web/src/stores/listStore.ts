import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useListStore = defineStore('lists', () => {
  const lists = ref<string[]>([])
  const activeList = ref<string>('todos')
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchLists() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch('/api/lists')
      const data = await res.json() as { lists: string[] }
      lists.value = data.lists
      // Set default active list if needed
      if (lists.value.length > 0 && !lists.value.includes(activeList.value)) {
        activeList.value = lists.value[0]
      }
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  function setActiveList(name: string) {
    activeList.value = name
  }

  async function deleteList(name: string) {
    try {
      await fetch(`/api/lists/${encodeURIComponent(name)}`, { method: 'DELETE' })
      lists.value = lists.value.filter((l) => l !== name)
      if (activeList.value === name) {
        activeList.value = lists.value[0] ?? 'todos'
      }
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
      lists.value.sort()
    }
  }

  return { lists, activeList, loading, error, fetchLists, setActiveList, deleteList, addListLocally }
})
