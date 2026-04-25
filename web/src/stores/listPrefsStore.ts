import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'

export type LayoutMode = 'grid' | 'kanban'
export type GridColumns = 2 | 3 | 4 | 5

export interface ListPref {
  layout: LayoutMode
  columns: GridColumns
}

export const GRID_COLUMN_OPTIONS: GridColumns[] = [2, 3, 4, 5]

const VALID_LAYOUTS: LayoutMode[] = ['grid', 'kanban']
const DEFAULT_PREF: ListPref = { layout: 'kanban', columns: 3 }

const STORAGE_KEY = 'list-prefs'

type PrefsMap = Record<string, ListPref>

function sanitize(input: unknown): PrefsMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const out: PrefsMap = {}
  for (const [list, val] of Object.entries(input as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue
    const v = val as Partial<ListPref>
    const layout = VALID_LAYOUTS.includes(v.layout as LayoutMode)
      ? (v.layout as LayoutMode)
      : DEFAULT_PREF.layout
    const columns = GRID_COLUMN_OPTIONS.includes(v.columns as GridColumns)
      ? (v.columns as GridColumns)
      : DEFAULT_PREF.columns
    out[list] = { layout, columns }
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

export const useListPrefsStore = defineStore('listPrefs', () => {
  const prefs = ref<PrefsMap>({})

  function loadFromCache() {
    prefs.value = readCache()
  }

  function reset() {
    prefs.value = {}
  }

  function get(list: string): ListPref {
    return prefs.value[list] ?? DEFAULT_PREF
  }

  async function pushAll(next: PrefsMap) {
    const res = await apiFetch('/api/settings/list-prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs: next }),
    })
    if (!res.ok) throw new Error('Save failed')
  }

  async function loadFromServer() {
    try {
      const res = await apiFetch('/api/settings/list-prefs')
      if (!res.ok) return
      const data = (await res.json()) as { prefs?: unknown }
      const serverPrefs = sanitize(data.prefs)
      const hasServerData = Object.keys(serverPrefs).length > 0
      const hasLocalData = Object.keys(prefs.value).length > 0
      if (hasServerData) {
        prefs.value = serverPrefs
        writeCache(serverPrefs)
      } else if (hasLocalData) {
        // First sync from this browser — seed the server with local prefs.
        try { await pushAll(prefs.value) } catch {}
      }
    } catch {}
  }

  async function update(list: string, patch: Partial<ListPref>) {
    const previousMap = { ...prefs.value }
    const prev = previousMap[list] ?? DEFAULT_PREF
    const nextMap = { ...previousMap, [list]: { ...prev, ...patch } }
    prefs.value = nextMap
    writeCache(nextMap)
    try {
      await pushAll(nextMap)
    } catch {
      prefs.value = previousMap
      writeCache(previousMap)
    }
  }

  function setLayout(list: string, layout: LayoutMode) {
    return update(list, { layout })
  }

  function setColumns(list: string, columns: GridColumns) {
    return update(list, { columns })
  }

  return { prefs, loadFromCache, loadFromServer, reset, get, update, setLayout, setColumns }
})
