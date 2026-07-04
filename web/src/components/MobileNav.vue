<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useSettingsStore } from '../stores/settingsStore'
import { themes } from '../lib/themes'
import type { ItemType } from '../types/todo'

const props = defineProps<{ mode: 'lists' | 'calendar' | 'discover' }>()

const emit = defineEmits<{
  add: [type: ItemType]
  'toggle-calendar': []
  'toggle-discover': []
  search: []
  import: []
  'go-lists': []
}>()

const authStore = useAuthStore()
const settingsStore = useSettingsStore()

const showAddSheet = ref(false)
const showMoreSheet = ref(false)

const isPro = () => authStore.tier === 'pro'

function pickAdd(type: ItemType) {
  showAddSheet.value = false
  emit('add', type)
}

function fromMore(action: () => void) {
  showMoreSheet.value = false
  action()
}
</script>

<template>
  <!-- Bottom tab bar — mobile only (hidden at md and up) -->
  <nav
    class="md:hidden flex-shrink-0 bg-surface border-t border-border flex items-stretch justify-around"
    style="padding-bottom: env(safe-area-inset-bottom)"
    aria-label="Primary"
  >
    <!-- Lists -->
    <button
      type="button"
      class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors"
      :class="props.mode === 'lists' ? 'text-accent' : 'text-muted hover:text-text'"
      @click="emit('go-lists')"
    >
      <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
      Lists
    </button>

    <!-- Calendar (Pro) -->
    <button
      v-if="isPro()"
      type="button"
      class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors"
      :class="props.mode === 'calendar' ? 'text-accent' : 'text-muted hover:text-text'"
      @click="emit('toggle-calendar')"
    >
      <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      Calendar
    </button>

    <!-- Add (emphasized) -->
    <button
      type="button"
      class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted hover:text-text transition-colors"
      aria-label="Add item"
      @click="showAddSheet = true"
    >
      <span class="flex items-center justify-center size-9 -mt-1 rounded-full bg-accent text-accent-fg shadow-sm">
        <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </span>
      Add
    </button>

    <!-- Search (Pro) -->
    <button
      v-if="isPro()"
      type="button"
      class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted hover:text-text transition-colors"
      @click="emit('search')"
    >
      <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
      </svg>
      Search
    </button>

    <!-- More -->
    <button
      type="button"
      class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors"
      :class="props.mode === 'discover' ? 'text-accent' : 'text-muted hover:text-text'"
      @click="showMoreSheet = true"
    >
      <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
      More
    </button>
  </nav>

  <!-- Add action sheet -->
  <Teleport to="body">
    <div v-if="showAddSheet" class="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
      <div class="absolute inset-0 bg-black/40" @click="showAddSheet = false" />
      <div
        class="relative bg-surface border-t border-border rounded-t-2xl px-2 pt-2"
        style="padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem)"
      >
        <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong" />
        <button
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
          @click="pickAdd('todo')"
        >
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="flex-1 text-left">Todo</span>
        </button>
        <button
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
          @click="pickAdd('bookmark')"
        >
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          <span class="flex-1 text-left">Bookmark</span>
        </button>
        <button
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
          @click="pickAdd('note')"
        >
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span class="flex-1 text-left">Note</span>
        </button>
        <button
          v-if="isPro()"
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
          @click="pickAdd('event')"
        >
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span class="flex-1 text-left">Event</span>
          <span class="rounded-full bg-accent/15 text-accent text-[10px] font-semibold px-1.5 py-0.5 tracking-wide">Pro</span>
        </button>
      </div>
    </div>
  </Teleport>

  <!-- More sheet -->
  <Teleport to="body">
    <div v-if="showMoreSheet" class="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
      <div class="absolute inset-0 bg-black/40" @click="showMoreSheet = false" />
      <div
        class="relative bg-surface border-t border-border rounded-t-2xl px-2 pt-2"
        style="padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem)"
      >
        <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong" />

        <!-- Discover (Pro) -->
        <button
          v-if="isPro()"
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
          :class="props.mode === 'discover' ? 'text-accent' : ''"
          @click="fromMore(() => emit('toggle-discover'))"
        >
          <svg class="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16zm-1-11l3 3-3 3m4-6l-3 3 3 3" />
          </svg>
          <span class="flex-1 text-left">Discover</span>
        </button>

        <!-- Import (Pro) -->
        <button
          v-if="isPro()"
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
          @click="fromMore(() => emit('import'))"
        >
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" />
          </svg>
          <span class="flex-1 text-left">Import bookmarks</span>
        </button>

        <!-- Light / dark toggle -->
        <div class="flex items-center gap-3 px-4 py-3">
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          <span class="flex-1">Appearance</span>
          <div class="flex rounded-lg border border-border-strong overflow-hidden">
            <button
              class="px-3 py-1 text-sm transition-colors"
              :class="settingsStore.mode === 'light' ? 'bg-accent text-accent-fg font-medium' : 'text-muted hover:text-text'"
              @click="settingsStore.setTheme(settingsStore.theme, 'light')"
            >
              Light
            </button>
            <button
              class="px-3 py-1 text-sm border-l border-border-strong transition-colors"
              :class="settingsStore.mode === 'dark' ? 'bg-accent text-accent-fg font-medium' : 'text-muted hover:text-text'"
              @click="settingsStore.setTheme(settingsStore.theme, 'dark')"
            >
              Dark
            </button>
          </div>
        </div>

        <!-- Colour themes -->
        <div class="grid grid-cols-2 gap-2 px-4 pb-2">
          <button
            v-for="t in themes"
            :key="t.name"
            type="button"
            class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors border"
            :class="settingsStore.theme === t.name
              ? 'border-accent bg-accent/10 font-medium text-text'
              : 'border-border hover:border-border-strong hover:bg-surface-hover text-muted hover:text-text'"
            @click="settingsStore.setTheme(t.name, settingsStore.mode)"
          >
            <span class="flex gap-0.5 shrink-0">
              <span
                class="size-3 rounded-full border border-black/10"
                :style="{ background: settingsStore.mode === 'dark' ? t.dark.bg : t.light.bg }"
              />
              <span
                class="size-3 rounded-full border border-black/10"
                :style="{ background: settingsStore.mode === 'dark' ? t.dark.surface : t.light.surface }"
              />
              <span
                class="size-3 rounded-full border border-black/10"
                :style="{ background: settingsStore.mode === 'dark' ? t.dark.accent : t.light.accent }"
              />
            </span>
            <span class="truncate">{{ t.label }}</span>
          </button>
        </div>

        <!-- Replay welcome tour -->
        <button
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
          @click="fromMore(() => settingsStore.replayWelcome())"
        >
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span class="flex-1 text-left">Show welcome tour</span>
        </button>

        <!-- Settings -->
        <a
          v-if="!authStore.isDemo"
          href="/settings"
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
        >
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span class="flex-1 text-left">Settings</span>
        </a>

        <!-- Account -->
        <a
          v-if="authStore.user && !authStore.isDemo"
          href="/account"
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text hover:bg-surface-hover transition-colors"
        >
          <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span class="flex-1 text-left">Account</span>
        </a>

        <!-- Admin -->
        <a
          v-if="authStore.isAdmin"
          href="/admin"
          class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-accent hover:bg-accent/10 transition-colors"
        >
          <svg class="size-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span class="flex-1 text-left">Admin dashboard</span>
        </a>
      </div>
    </div>
  </Teleport>
</template>
