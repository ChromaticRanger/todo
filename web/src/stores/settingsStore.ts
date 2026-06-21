import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'

export type ThemeName = 'midnight' | 'slate' | 'forest' | 'sunset' | 'rose' | 'mono'
export type ThemeMode = 'light' | 'dark'
export type CompletedWindow = '7d' | '30d' | '90d' | '1y' | 'all'
export type CalendarView = 'month' | 'week'

interface UiSettings {
  theme: ThemeName
  mode: ThemeMode
}

const STORAGE_KEY = 'theme_settings'
const COMPLETED_WINDOW_KEY = 'completed_window'
const CALENDAR_VIEW_KEY = 'calendar_view'
const DEFAULT: UiSettings = { theme: 'midnight', mode: 'light' }
const DEFAULT_COMPLETED_WINDOW: CompletedWindow = '30d'
const DEFAULT_CALENDAR_VIEW: CalendarView = 'month'

const VALID_THEMES: ThemeName[] = ['midnight', 'slate', 'forest', 'sunset', 'rose', 'mono']
const VALID_MODES: ThemeMode[] = ['light', 'dark']
const VALID_COMPLETED_WINDOWS: CompletedWindow[] = ['7d', '30d', '90d', '1y', 'all']
const VALID_CALENDAR_VIEWS: CalendarView[] = ['month', 'week']

function readCompletedWindow(): CompletedWindow {
  try {
    const raw = localStorage.getItem(COMPLETED_WINDOW_KEY)
    if (raw && VALID_COMPLETED_WINDOWS.includes(raw as CompletedWindow)) {
      return raw as CompletedWindow
    }
  } catch {}
  return DEFAULT_COMPLETED_WINDOW
}

function writeCompletedWindow(w: CompletedWindow) {
  try {
    localStorage.setItem(COMPLETED_WINDOW_KEY, w)
  } catch {}
}

function readCalendarView(): CalendarView {
  try {
    const raw = localStorage.getItem(CALENDAR_VIEW_KEY)
    if (raw && VALID_CALENDAR_VIEWS.includes(raw as CalendarView)) {
      return raw as CalendarView
    }
  } catch {}
  return DEFAULT_CALENDAR_VIEW
}

function writeCalendarView(v: CalendarView) {
  try {
    localStorage.setItem(CALENDAR_VIEW_KEY, v)
  } catch {}
}

function readCache(): UiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT
    const parsed = JSON.parse(raw) as Partial<UiSettings>
    const theme = VALID_THEMES.includes(parsed.theme as ThemeName) ? parsed.theme! : DEFAULT.theme
    const mode = VALID_MODES.includes(parsed.mode as ThemeMode) ? parsed.mode! : DEFAULT.mode
    return { theme, mode }
  } catch {
    return DEFAULT
  }
}

function writeCache(settings: UiSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

function applyToDom(settings: UiSettings) {
  document.documentElement.dataset.theme = settings.theme
  document.documentElement.dataset.mode = settings.mode
}

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<ThemeName>(DEFAULT.theme)
  const mode = ref<ThemeMode>(DEFAULT.mode)
  // Default true: existing users (no onboarding row) are treated as already
  // onboarded. Only the post-signup hook writes hasSeenWelcome=false.
  const hasSeenWelcome = ref(true)
  // Transient flag — true while the user-menu replay is open. Not persisted.
  const replayingWelcome = ref(false)
  // Whether the "due today" reminder modal pops on login. Server-persisted,
  // toggled from the Account page. Defaults true (opt-out feature).
  const dueTodayModalEnabled = ref(true)
  // How far back the Completed view fetches. Local-only (no server sync) —
  // a per-device preference, like list collapse state.
  const completedWindow = ref<CompletedWindow>(DEFAULT_COMPLETED_WINDOW)
  // Month vs Week layout for the schedule calendar. Local-only.
  const calendarView = ref<CalendarView>(DEFAULT_CALENDAR_VIEW)

  /** Call synchronously before app.mount() to prevent flash. */
  function loadFromCache() {
    const cached = readCache()
    theme.value = cached.theme
    mode.value = cached.mode
    applyToDom(cached)
    completedWindow.value = readCompletedWindow()
    calendarView.value = readCalendarView()
  }

  function setCompletedWindow(w: CompletedWindow) {
    completedWindow.value = w
    writeCompletedWindow(w)
  }

  function setCalendarView(v: CalendarView) {
    calendarView.value = v
    writeCalendarView(v)
  }

  /** Call after authentication to sync from server. */
  async function loadFromServer() {
    try {
      const res = await apiFetch('/api/settings')
      if (!res.ok) return
      const data = await res.json() as UiSettings
      if (
        VALID_THEMES.includes(data.theme) &&
        VALID_MODES.includes(data.mode)
      ) {
        theme.value = data.theme
        mode.value = data.mode
        applyToDom(data)
        writeCache(data)
      }
    } catch {}
    try {
      const res = await apiFetch('/api/settings/onboarding')
      if (res.ok) {
        const data = (await res.json()) as { hasSeenWelcome?: boolean }
        hasSeenWelcome.value = data.hasSeenWelcome !== false
      }
    } catch {}
    await loadDueTodayPref()
  }

  /** Fetch just the due-today-modal preference. Used standalone by the Account
   *  page, which doesn't run the full loadFromServer. */
  async function loadDueTodayPref() {
    try {
      const res = await apiFetch('/api/settings/due-today-modal')
      if (res.ok) {
        const data = (await res.json()) as { enabled?: boolean }
        dueTodayModalEnabled.value = data.enabled !== false
      }
    } catch {}
  }

  async function setDueTodayModalEnabled(enabled: boolean) {
    const previous = dueTodayModalEnabled.value
    dueTodayModalEnabled.value = enabled
    try {
      const res = await apiFetch('/api/settings/due-today-modal', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Save failed')
    } catch (e) {
      dueTodayModalEnabled.value = previous
      throw e
    }
  }

  async function completeWelcome() {
    hasSeenWelcome.value = true
    replayingWelcome.value = false
    try {
      await apiFetch('/api/settings/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasSeenWelcome: true }),
      })
    } catch {}
  }

  function replayWelcome() {
    replayingWelcome.value = true
  }

  function dismissReplay() {
    replayingWelcome.value = false
  }

  async function setTheme(newTheme: ThemeName, newMode: ThemeMode) {
    const previous = { theme: theme.value, mode: mode.value }
    theme.value = newTheme
    mode.value = newMode
    applyToDom({ theme: newTheme, mode: newMode })
    writeCache({ theme: newTheme, mode: newMode })
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme, mode: newMode }),
      })
      if (!res.ok) throw new Error('Save failed')
    } catch {
      // Revert on failure
      theme.value = previous.theme
      mode.value = previous.mode
      applyToDom(previous)
      writeCache(previous)
    }
  }

  return {
    theme,
    mode,
    hasSeenWelcome,
    replayingWelcome,
    dueTodayModalEnabled,
    completedWindow,
    calendarView,
    loadFromCache,
    loadFromServer,
    loadDueTodayPref,
    setDueTodayModalEnabled,
    setTheme,
    setCompletedWindow,
    setCalendarView,
    completeWelcome,
    replayWelcome,
    dismissReplay,
  }
})
