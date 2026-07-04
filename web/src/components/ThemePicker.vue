<script setup lang="ts">
import { ref } from 'vue'
import { useSettingsStore, type ThemeName, type ThemeMode } from '../stores/settingsStore'
import { themes } from '../lib/themes'

const store = useSettingsStore()
const open = ref(false)

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function pickMode(m: ThemeMode) {
  store.setTheme(store.theme, m)
}

function pickTheme(t: ThemeName) {
  store.setTheme(t, store.mode)
}

</script>

<template>
  <div data-tour="theme-picker" class="relative">
    <!-- Trigger -->
    <button
      type="button"
      class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-muted hover:text-text hover:bg-surface-hover text-sm transition-colors"
      :title="`Theme: ${store.theme} / ${store.mode}`"
      @click="toggle"
    >
      <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
      Theme
    </button>

    <!-- Backdrop to close on click-outside -->
    <div
      v-if="open"
      class="fixed inset-0 z-40"
      @click="close"
    />

    <!-- Popover -->
    <div
      v-if="open"
      class="absolute right-0 top-full mt-2 z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl bg-surface border border-border shadow-xl dark:shadow-none dark:inset-ring dark:inset-ring-white/5 p-4"
    >
      <!-- Mode toggle -->
      <div class="flex rounded-lg border border-border-strong overflow-hidden mb-4">
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm transition-colors"
          :class="store.mode === 'light' ? 'bg-accent text-accent-fg font-medium' : 'text-muted hover:text-text hover:bg-surface-hover'"
          @click="pickMode('light')"
        >
          <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
          Light
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm border-l border-border-strong transition-colors"
          :class="store.mode === 'dark' ? 'bg-accent text-accent-fg font-medium' : 'text-muted hover:text-text hover:bg-surface-hover'"
          @click="pickMode('dark')"
        >
          <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          Dark
        </button>
      </div>

      <!-- Theme grid -->
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="t in themes"
          :key="t.name"
          type="button"
          class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors border"
          :class="store.theme === t.name
            ? 'border-accent bg-accent/10 font-medium text-text'
            : 'border-border hover:border-border-strong hover:bg-surface-hover text-muted hover:text-text'"
          @click="pickTheme(t.name)"
        >
          <!-- Swatches -->
          <span class="flex gap-0.5 shrink-0">
            <span
              class="size-3 rounded-full border border-black/10"
              :style="{ background: store.mode === 'dark' ? t.dark.bg : t.light.bg }"
            />
            <span
              class="size-3 rounded-full border border-black/10"
              :style="{ background: store.mode === 'dark' ? t.dark.surface : t.light.surface }"
            />
            <span
              class="size-3 rounded-full border border-black/10"
              :style="{ background: store.mode === 'dark' ? t.dark.accent : t.light.accent }"
            />
          </span>
          <span class="truncate">{{ t.label }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
