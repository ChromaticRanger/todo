import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'

export type ItemLayout = 'list' | 'grid'

export interface CategoryPref {
  itemLayout: ItemLayout
}

const VALID_LAYOUTS: ItemLayout[] = ['list', 'grid']
const DEFAULT_PREF: CategoryPref = { itemLayout: 'list' }

const STORAGE_KEY = 'category-prefs'

type CategoryMap = Record<string, CategoryPref>
type PrefsMap = Record<string, CategoryMap>

function sanitize(input: unknown): PrefsMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: PrefsMap = {}
  for (const [list, cats] of Object.entries(input as Record<string, unknown>)) {
    if (!cats || typeof cats !== 'object' || Array.isArray(cats)) continue
    const catMap: CategoryMap = {}
    for (const [cat, val] of Object.entries(cats as Record<string, unknown>)) {
      if (!val || typeof val !== 'object') continue
      const v = val as Partial<CategoryPref>
      const itemLayout = VALID_LAYOUTS.includes(v.itemLayout as ItemLayout)
        ? (v.itemLayout as ItemLayout)
        : DEFAULT_PREF.itemLayout
      // Skip storing the default to keep payload small.
      if (itemLayout === DEFAULT_PREF.itemLayout) continue
      catMap[cat] = { itemLayout }
    }
    if (Object.keys(catMap).length > 0) out[list] = catMap
  }
  return out
}

function readCache(): PrefsMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return sanitize(JSON.parse(raw))
  } catch {}
  return {}
}

function writeCache(prefs: PrefsMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {}
}

export const useCategoryPrefsStore = defineStore('categoryPrefs', () => {
  const prefs = ref<PrefsMap>({})

  function loadFromCache() {
    prefs.value = readCache()
  }

  function reset() {
    prefs.value = {}
  }

  function get(list: string, category: string): CategoryPref {
    return prefs.value[list]?.[category] ?? DEFAULT_PREF
  }

  async function pushAll(next: PrefsMap) {
    const res = await apiFetch('/api/settings/category-prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: next }),
    })
    // 404 means the endpoint hasn't been deployed yet — keep local state
    // rather than rolling back, so the feature still works per-device.
    if (res.status === 404) return
    if (!res.ok) throw new Error('Save failed')
  }

  async function loadFromServer() {
    try {
      const res = await apiFetch('/api/settings/category-prefs')
      if (!res.ok) return
      const data = (await res.json()) as { prefs?: unknown }
      const serverPrefs = sanitize(data.prefs)
      const hasServerData = Object.keys(serverPrefs).length > 0
      const hasLocalData = Object.keys(prefs.value).length > 0
      if (hasServerData) {
        prefs.value = serverPrefs
        writeCache(serverPrefs)
      } else if (hasLocalData) {
        try { await pushAll(prefs.value) } catch {}
      }
    } catch {}
  }

  async function update(list: string, category: string, patch: Partial<CategoryPref>) {
    const previousMap = JSON.parse(JSON.stringify(prefs.value)) as PrefsMap
    const prev = previousMap[list]?.[category] ?? DEFAULT_PREF
    const merged: CategoryPref = { ...prev, ...patch }
    const nextMap: PrefsMap = { ...previousMap }
    const catMap: CategoryMap = { ...(nextMap[list] ?? {}) }
    if (merged.itemLayout === DEFAULT_PREF.itemLayout) {
      delete catMap[category]
    } else {
      catMap[category] = merged
    }
    if (Object.keys(catMap).length > 0) {
      nextMap[list] = catMap
    } else {
      delete nextMap[list]
    }
    prefs.value = nextMap
    writeCache(nextMap)
    try {
      await pushAll(nextMap)
    } catch {
      prefs.value = previousMap
      writeCache(previousMap)
    }
  }

  function setItemLayout(list: string, category: string, itemLayout: ItemLayout) {
    return update(list, category, { itemLayout })
  }

  return { prefs, loadFromCache, loadFromServer, reset, get, update, setItemLayout }
})
