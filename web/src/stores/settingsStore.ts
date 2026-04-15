import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiFetch } from '../lib/api'

export type ThemeName = 'midnight' | 'slate' | 'forest' | 'sunset' | 'rose' | 'mono'
export type ThemeMode = 'light' | 'dark'

interface UiSettings {
  theme: ThemeName
  mode: ThemeMode
}

const STORAGE_KEY = 'theme_settings'
const DEFAULT: UiSettings = { theme: 'midnight', mode: 'dark' }

const VALID_THEMES: ThemeName[] = ['midnight', 'slate', 'forest', 'sunset', 'rose', 'mono']
const VALID_MODES: ThemeMode[] = ['light', 'dark']

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

  /** Call synchronously before app.mount() to prevent flash. */
  function loadFromCache() {
    const cached = readCache()
    theme.value = cached.theme
    mode.value = cached.mode
    applyToDom(cached)
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

  return { theme, mode, loadFromCache, loadFromServer, setTheme }
})
