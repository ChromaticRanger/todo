import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'

export type ItemLayout = 'list' | 'grid'

export interface CategoryPref {
  itemLayout: ItemLayout
  itemOrder?: number[]
}

const VALID_LAYOUTS: ItemLayout[] = ['list', 'grid']
const DEFAULT_PREF: CategoryPref = { itemLayout: 'list' }
const ITEM_ORDER_MAX = 500

const STORAGE_KEY = 'category-prefs'

type CategoryMap = Record<string, CategoryPref>
type PrefsMap = Record<string, CategoryMap>

function sanitizeItemOrder(input: unknown): number[] | undefined {
  if (!Array.isArray(input)) return undefined
  const seen = new Set<number>()
  const out: number[] = []
  for (const v of input) {
    if (typeof v !== 'number' || !Number.isFinite(v) || seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= ITEM_ORDER_MAX) break
  }
  return out.length > 0 ? out : undefined
}

function isDefaultPref(p: CategoryPref): boolean {
  return p.itemLayout === DEFAULT_PREF.itemLayout && (!p.itemOrder || p.itemOrder.length === 0)
}

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
      const itemOrder = sanitizeItemOrder(v.itemOrder)
      const pref: CategoryPref = { itemLayout }
      if (itemOrder) pref.itemOrder = itemOrder
      // Skip storing the default to keep payload small.
      if (isDefaultPref(pref)) continue
      catMap[cat] = pref
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

  async function persist(nextMap: PrefsMap, previousMap: PrefsMap) {
    prefs.value = nextMap
    writeCache(nextMap)
    try {
      await pushAll(nextMap)
    } catch {
      prefs.value = previousMap
      writeCache(previousMap)
    }
  }

  async function update(list: string, category: string, patch: Partial<CategoryPref>) {
    const previousMap = JSON.parse(JSON.stringify(prefs.value)) as PrefsMap
    const prev = previousMap[list]?.[category] ?? DEFAULT_PREF
    const merged: CategoryPref = { ...prev, ...patch }
    if (merged.itemOrder !== undefined) {
      const cleaned = sanitizeItemOrder(merged.itemOrder)
      if (cleaned) merged.itemOrder = cleaned
      else delete merged.itemOrder
    }
    const nextMap: PrefsMap = { ...previousMap }
    const catMap: CategoryMap = { ...(nextMap[list] ?? {}) }
    if (isDefaultPref(merged)) {
      delete catMap[category]
    } else {
      catMap[category] = merged
    }
    if (Object.keys(catMap).length > 0) {
      nextMap[list] = catMap
    } else {
      delete nextMap[list]
    }
    await persist(nextMap, previousMap)
  }

  function setItemLayout(list: string, category: string, itemLayout: ItemLayout) {
    return update(list, category, { itemLayout })
  }

  function setItemOrder(list: string, category: string, ids: number[]) {
    return update(list, category, { itemOrder: ids })
  }

  async function clearCategory(list: string, category: string) {
    const previousMap = JSON.parse(JSON.stringify(prefs.value)) as PrefsMap
    if (!previousMap[list]?.[category]) return
    const nextMap: PrefsMap = { ...previousMap }
    const catMap: CategoryMap = { ...nextMap[list] }
    delete catMap[category]
    if (Object.keys(catMap).length > 0) nextMap[list] = catMap
    else delete nextMap[list]
    await persist(nextMap, previousMap)
  }

  async function renamePrefCategory(list: string, oldName: string, newName: string) {
    const previousMap = JSON.parse(JSON.stringify(prefs.value)) as PrefsMap
    const entry = previousMap[list]?.[oldName]
    if (!entry) return
    const nextMap: PrefsMap = { ...previousMap }
    const catMap: CategoryMap = { ...nextMap[list] }
    delete catMap[oldName]
    catMap[newName] = entry
    nextMap[list] = catMap
    await persist(nextMap, previousMap)
  }

  return {
    prefs,
    loadFromCache,
    loadFromServer,
    reset,
    get,
    update,
    setItemLayout,
    setItemOrder,
    clearCategory,
    renamePrefCategory,
  }
})
