<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'

const emit = defineEmits<{
  submit: [name: string]
  cancel: []
}>()

const name = ref('')
const input = ref<HTMLInputElement | null>(null)

onMounted(() => input.value?.focus())
useEscapeKey(() => emit('cancel'))

function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) return
  emit('submit', trimmed)
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-surface border border-border-strong/60 rounded-xl max-w-sm w-full mx-4 overflow-hidden dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5">
      <div class="px-4 py-2.5 border-b border-border-strong/60 bg-surface-hover/40">
        <h3 class="text-sm font-semibold text-muted uppercase tracking-wider">New category</h3>
      </div>
      <div class="p-4">
        <input
          ref="input"
          v-model="name"
          type="text"
          placeholder="Category name"
          class="w-full bg-bg border border-border-strong rounded-lg px-3 py-1.5 text-text text-sm focus:outline-none focus:border-accent"
          @keydown.enter="submit"
        />
      </div>
      <div class="flex gap-3 justify-end px-4 py-3 border-t border-border-strong/60 bg-surface-hover/20">
        <button
          class="px-4 py-1.5 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          :disabled="!name.trim()"
          class="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg text-sm font-medium transition-colors"
          @click="submit"
        >
          Create
        </button>
      </div>
    </div>
  </div>
</template>
