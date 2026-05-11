import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'
import type { ListCategory } from '../shared/listCategories'

export interface SharedListMeta {
  id: number
  slug: string
  name: string
  description: string
  icon: string
  category: ListCategory
  owner_user_id: string
  owner_name: string
  owner_is_system: boolean
  item_count: number
  published_at: string
  updated_at: string
}

export interface SharedItem {
  id: number
  category: string
  type: 'todo' | 'bookmark' | 'note' | 'event'
  title: string
  description: string
  url: string | null
  priority: number
  repeat_days: number
  repeat_months: number
}

export interface SharedListDetail {
  list: SharedListMeta
  categories: { name: string; items: SharedItem[] }[]
}

export interface PublicationStatus {
  published: boolean
  slug?: string
  updated_at?: string
  category?: ListCategory
}

export interface PublicationSummary {
  slug: string
  updated_at: string
}

export const useDiscoverStore = defineStore('discover', () => {
  const lists = ref<SharedListMeta[]>([])
  const detail = ref<SharedListDetail | null>(null)
  const selectedSlug = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const filterCategory = ref<ListCategory | null>(null)
  const filterPublisher = ref('')

  // Map of the caller's own listName → publication summary (only their published lists)
  const publications = ref<Record<string, PublicationSummary>>({})

  async function fetchPublications() {
    try {
      const res = await apiFetch('/api/shared/publications')
      if (!res.ok) return
      const data = (await res.json()) as {
        publications: { list_name: string; slug: string; updated_at: string }[]
      }
      const next: Record<string, PublicationSummary> = {}
      for (const p of data.publications) {
        next[p.list_name] = { slug: p.slug, updated_at: p.updated_at }
      }
      publications.value = next
    } catch {
      // best-effort; leave previous state intact
    }
  }

  function renamePublication(oldName: string, newName: string) {
    const entry = publications.value[oldName]
    if (!entry) return
    const next = { ...publications.value }
    delete next[oldName]
    next[newName] = entry
    publications.value = next
  }

  function clearPublication(listName: string) {
    if (!(listName in publications.value)) return
    const next = { ...publications.value }
    delete next[listName]
    publications.value = next
  }

  async function fetchLists() {
    loading.value = true
    error.value = null
    try {
      const params = new URLSearchParams()
      if (filterCategory.value) params.set('category', filterCategory.value)
      const pub = filterPublisher.value.trim()
      if (pub) params.set('publisher', pub)
      const qs = params.toString()
      const res = await apiFetch(`/api/shared/lists${qs ? `?${qs}` : ''}`)
      if (!res.ok) {
        error.value = `Failed to load Discover (${res.status})`
        return
      }
      const data = (await res.json()) as { lists: SharedListMeta[] }
      lists.value = data.lists
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(slug: string) {
    loading.value = true
    error.value = null
    detail.value = null
    try {
      const res = await apiFetch(`/api/shared/lists/${encodeURIComponent(slug)}`)
      if (!res.ok) {
        error.value = res.status === 404 ? 'List not found' : `Failed to load list (${res.status})`
        return
      }
      detail.value = (await res.json()) as SharedListDetail
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  async function clone(slug: string, listName?: string): Promise<{ list_name: string; inserted_count: number } | null> {
    try {
      const res = await apiFetch(`/api/shared/lists/${encodeURIComponent(slug)}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(listName ? { listName } : {}),
      })
      if (!res.ok) {
        error.value = `Failed to clone (${res.status})`
        return null
      }
      return (await res.json()) as { list_name: string; inserted_count: number }
    } catch (e) {
      error.value = String(e)
      return null
    }
  }

  async function publish(
    listName: string,
    meta: { name?: string; description?: string; icon?: string; category?: ListCategory }
  ): Promise<{ slug: string; item_count: number; updated: boolean } | null> {
    try {
      const res = await apiFetch('/api/shared/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listName, ...meta }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        error.value = body?.error ?? `Failed to publish (${res.status})`
        return null
      }
      return (await res.json()) as { slug: string; item_count: number; updated: boolean }
    } catch (e) {
      error.value = String(e)
      return null
    }
  }

  async function unpublish(slug: string): Promise<boolean> {
    try {
      const res = await apiFetch(`/api/shared/lists/${encodeURIComponent(slug)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        error.value = `Failed to unpublish (${res.status})`
        return false
      }
      return true
    } catch (e) {
      error.value = String(e)
      return false
    }
  }

  async function publicationStatus(listName: string): Promise<PublicationStatus> {
    try {
      const res = await apiFetch(
        `/api/shared/publication-status?listName=${encodeURIComponent(listName)}`
      )
      if (!res.ok) return { published: false }
      return (await res.json()) as PublicationStatus
    } catch {
      return { published: false }
    }
  }

  function selectSlug(slug: string | null) {
    selectedSlug.value = slug
    if (slug) {
      void fetchDetail(slug)
    } else {
      detail.value = null
    }
  }

  function reset() {
    lists.value = []
    detail.value = null
    selectedSlug.value = null
    error.value = null
    publications.value = {}
  }

  return {
    lists,
    detail,
    selectedSlug,
    loading,
    error,
    filterCategory,
    filterPublisher,
    publications,
    fetchLists,
    fetchDetail,
    clone,
    publish,
    unpublish,
    publicationStatus,
    fetchPublications,
    renamePublication,
    clearPublication,
    selectSlug,
    reset,
  }
})
