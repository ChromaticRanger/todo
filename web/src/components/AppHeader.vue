<script setup lang="ts">
import { useAuthStore } from '../stores/authStore'
import ThemePicker from './ThemePicker.vue'

defineEmits<{ addTodo: [] }>()

const authStore = useAuthStore()
</script>

<template>
  <header class="bg-surface border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0">
    <div class="flex items-center gap-3">
      <svg class="size-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4" />
      </svg>
      <h1 class="text-lg font-semibold text-text">Todo Dashboard</h1>
    </div>
    <div class="flex items-center gap-2">
      <button
        class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors"
        @click="$emit('addTodo')"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Todo
      </button>
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
