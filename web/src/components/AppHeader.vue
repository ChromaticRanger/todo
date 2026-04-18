<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/authStore'
import ThemePicker from './ThemePicker.vue'
import type { ItemType } from '../types/todo'

const emit = defineEmits<{ add: [type: ItemType] }>()

const authStore = useAuthStore()
const showTypeMenu = ref(false)

function openAdd(type: ItemType) {
  showTypeMenu.value = false
  emit('add', type)
}
</script>

<template>
  <header class="bg-surface border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
    <div class="flex items-center gap-3">
      <svg class="size-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4" />
      </svg>
      <h1 class="text-lg font-semibold text-text">My Stash</h1>
    </div>
    <div class="flex items-center gap-2">
      <!-- Add button with type dropdown -->
      <div class="relative">
        <button
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors"
          @click="showTypeMenu = !showTypeMenu"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add
          <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div
          v-if="showTypeMenu"
          class="absolute right-0 top-full mt-1 z-20 bg-surface border border-border-strong rounded-lg shadow-lg py-1 min-w-48"
        >
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            @click="openAdd('todo')"
          >
            <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="flex-1">Todo</span>
            <kbd class="text-[11px] text-muted font-mono tracking-tight">Alt+T</kbd>
          </button>
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            @click="openAdd('bookmark')"
          >
            <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span class="flex-1">Bookmark</span>
            <kbd class="text-[11px] text-muted font-mono tracking-tight">Alt+B</kbd>
          </button>
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            @click="openAdd('note')"
          >
            <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="flex-1">Note</span>
            <kbd class="text-[11px] text-muted font-mono tracking-tight">Alt+N</kbd>
          </button>
        </div>

        <!-- Click-outside overlay -->
        <div
          v-if="showTypeMenu"
          class="fixed inset-0 z-10"
          @click="showTypeMenu = false"
        />
      </div>

      <ThemePicker />
      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-muted hover:text-text hover:bg-surface-hover text-sm transition-colors"
        @click="authStore.logout()"
        title="Sign out"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign out
      </button>
    </div>
  </header>
</template>
