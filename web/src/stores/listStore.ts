import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiFetch } from '../lib/api'

export type ShareRole = 'viewer' | 'editor'

/** A list someone else owns and has shared with this user. */
export interface SharedListMeta {
  /** `@<collabId>` — the tab identity, cache key and preference key. */
  key: string
  collab_id: number
  /** This user's own membership row, used to leave the share. */
  member_id: number
  /** The owner's name for the list. Two people may both have a "Home". */
  name: string
  owner_id: string
  owner_name: string
  role: ShareRole
}

/** Sharing status of one of the user's OWN lists, keyed by list name. */
export interface SharedByMe {
  collab_id: number
  member_count: number
  pending_invites: number
}

export const useListStore = defineStore('lists', () => {
  const lists = ref<string[]>([])
  // Lists with no todos yet — server can't materialize them via DISTINCT, so
  // we keep them in app_settings.empty_lists and union them in on fetch.
  // Entries self-clean once the list gets a real item.
  const emptyLists = ref<string[]>([])
  // Lists shared WITH this user. Deliberately separate from `lists` (which
  // stays the user's own names): the two namespaces can collide, and only
  // `lists` may be renamed, deleted or posted into by the extension.
  const sharedLists = ref<SharedListMeta[]>([])
  // Lists of this user's own that they have shared with others.
  const sharedByMe = ref<Record<string, SharedByMe>>({})
  const activeList = ref<string>('todos')
  const loading = ref(false)
  const error = ref<string | null>(null)

  // The saved tab order can contain share keys, since shared lists take part in
  // the same drag-to-reorder as own lists.
  const listOrder = ref<string[]>([])

  /** Every tab to render, own and shared, in the user's saved order. */
  const allTabs = computed(() =>
    applyOrder([...lists.value, ...sharedLists.value.map((s) => s.key)], listOrder.value)
  )

  function metaFor(key: string): SharedListMeta | undefined {
    return sharedLists.value.find((s) => s.key === key)
  }

  function isShared(key: string): boolean {
    return metaFor(key) !== undefined
  }

  /** 'owner' for your own lists, otherwise your role on the share. */
  function roleOf(key: string): 'owner' | ShareRole {
    return metaFor(key)?.role ?? 'owner'
  }

  /** Whether the user may add to or modify items in this list. */
  function canWrite(key: string): boolean {
    return roleOf(key) !== 'viewer'
  }

  /**
   * Whether the user may reshape the list itself — rename it, delete it, manage
   * its categories, or change who it's shared with.
   *
   * Stricter than `canWrite`: an editor adds and edits items but doesn't
   * restructure someone else's list. Mirrors the server's `owner_only` guard on
   * the category routes.
   */
  function canManage(key: string): boolean {
    return roleOf(key) === 'owner'
  }

  /** Label for a tab: shared lists show the owner's name for the list. */
  function displayName(key: string): string {
    return metaFor(key)?.name ?? key
  }

  /** Raw sharing record for one of your own lists, if one exists. */
  function shareStatus(listName: string): SharedByMe | undefined {
    return sharedByMe.value[listName]
  }

  /**
   * Whether anyone actually has (or has been offered) access to this list.
   *
   * A list_collab row outlives its last member on purpose — it holds the
   * list's share identity, so re-inviting someone restores the same `@id` key
   * and their saved per-list preferences still apply. That means the row's
   * mere existence does NOT mean the list is shared; the counts do.
   */
  function isSharedByMe(listName: string): boolean {
    const status = sharedByMe.value[listName]
    if (!status) return false
    return status.member_count > 0 || status.pending_invites > 0
  }

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
      const {
        lists: fetched,
        shared = [],
        shared_by_me = {},
      } = (await listsRes.json()) as {
        lists: string[]
        shared?: SharedListMeta[]
        shared_by_me?: Record<string, SharedByMe>
      }
      sharedLists.value = shared
      sharedByMe.value = shared_by_me
      const savedOrder = orderRes.ok
        ? ((await orderRes.json()) as { order: string[] }).order
        : []
      listOrder.value = savedOrder
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

      // Validity is checked against every tab, not just own lists — the active
      // tab may be a shared list. A share that's been revoked simply drops out
      // of allTabs and the fallback below picks it up.
      const tabs = allTabs.value
      if (savedActive && tabs.includes(savedActive)) {
        activeList.value = savedActive
      } else if (tabs.length > 0 && !tabs.includes(activeList.value)) {
        activeList.value = tabs[0]
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
        // Persists own and shared tabs together — the order is a per-user view
        // preference, and a share key is a legal member of it.
        body: JSON.stringify({ order: allTabs.value }),
      })
    } catch (e) {
      error.value = String(e)
    }
  }

  /** Persist the tab ordering (own + shared). Call after a drag completes. */
  async function reorderLists(newOrder: string[]) {
    listOrder.value = newOrder
    await saveOrder()
  }

  async function renameList(oldName: string, newName: string) {
    // Only the owner renames a list, and they address it by name. A shared tab
    // isn't yours to rename.
    if (isShared(oldName)) return
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
    // Deleting a shared list would delete the OWNER's items. Members leave
    // instead (see collabStore.leaveShare).
    if (isShared(name)) return
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
    sharedLists.value = []
    sharedByMe.value = {}
    listOrder.value = []
    activeList.value = 'todos'
    error.value = null
  }

  return {
    lists, activeList, loading, error, fetchLists, setActiveList, reorderLists,
    renameList, deleteList, addListLocally, reset,
    // Sharing
    sharedLists, sharedByMe, allTabs, metaFor, isShared, roleOf, canWrite,
    displayName, shareStatus, isSharedByMe, canManage,
  }
})
