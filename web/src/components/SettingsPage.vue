<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import ToggleSwitch from './ToggleSwitch.vue'

const settingsStore = useSettingsStore()

const saveError = ref('')

type PrefKey = 'dueTodayModal' | 'dueTodayIncludeOverdue' | 'confirmBeforeDelete'

async function onToggle(key: PrefKey, value: boolean) {
  saveError.value = ''
  try {
    await settingsStore.setPreference(key, value)
  } catch {
    saveError.value = "Couldn't save that setting. Please try again."
  }
}

function backToApp() {
  window.location.href = '/'
}

onMounted(() => {
  // The /settings route doesn't run the app's full settings load, so fetch
  // preferences explicitly.
  void settingsStore.loadPreferences()
})
</script>

<template>
  <div class="min-h-dvh bg-bg text-text p-6 antialiased">
    <div class="mx-auto max-w-xl">
      <button
        type="button"
        class="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
        @click="backToApp"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Stash Squirrel
      </button>

      <h1 class="text-2xl font-semibold mb-1">Settings</h1>
      <p class="text-sm text-muted mb-8">Customize how Stash Squirrel behaves.</p>

      <div
        v-if="saveError"
        class="rounded-lg bg-danger-bg ring-1 ring-danger/60 px-4 py-3 text-sm text-danger-fg mb-6"
      >
        {{ saveError }}
      </div>

      <!-- Daily reminders -->
      <div class="rounded-2xl bg-surface ring-1 ring-ring p-6 mb-6 dark:inset-ring dark:inset-ring-white/5">
        <h2 class="text-base font-semibold mb-1">Daily reminders</h2>
        <p class="text-sm text-muted mb-4">
          Control the reminders Stash Squirrel shows you.
        </p>

        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-sm font-medium text-text">"Due today" pop-up on sign-in</div>
            <div class="text-xs text-muted mt-0.5">
              When you sign in, show a summary of everything due today across all your lists.
            </div>
          </div>
          <ToggleSwitch
            :model-value="settingsStore.dueTodayModalEnabled"
            label='Show "due today" pop-up on sign-in'
            @update:model-value="onToggle('dueTodayModal', $event)"
          />
        </div>

        <div class="mt-4 flex items-center justify-between gap-4 border-t border-border/60 pt-4">
          <div class="min-w-0">
            <div
              class="text-sm font-medium"
              :class="settingsStore.dueTodayModalEnabled ? 'text-text' : 'text-muted'"
            >
              Include overdue items
            </div>
            <div class="text-xs text-muted mt-0.5">
              Also list anything carried over from before today in the pop-up.
            </div>
          </div>
          <ToggleSwitch
            :model-value="settingsStore.dueTodayIncludeOverdue"
            :disabled="!settingsStore.dueTodayModalEnabled"
            label="Include overdue items in the pop-up"
            @update:model-value="onToggle('dueTodayIncludeOverdue', $event)"
          />
        </div>
      </div>

      <!-- Behavior -->
      <div class="rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5">
        <h2 class="text-base font-semibold mb-1">Behavior</h2>
        <p class="text-sm text-muted mb-4">
          Fine-tune how actions work.
        </p>

        <div class="flex items-center justify-between gap-4">
          <div class="min-w-0">
            <div class="text-sm font-medium text-text">Confirm before deleting</div>
            <div class="text-xs text-muted mt-0.5">
              Ask for confirmation before deleting a todo, note, or bookmark. Turn off to
              delete in one click.
            </div>
          </div>
          <ToggleSwitch
            :model-value="settingsStore.confirmBeforeDelete"
            label="Confirm before deleting"
            @update:model-value="onToggle('confirmBeforeDelete', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
