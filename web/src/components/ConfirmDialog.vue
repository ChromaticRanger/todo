<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'

withDefaults(
  defineProps<{ message: string; confirmLabel?: string }>(),
  { confirmLabel: 'Delete' }
)
const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const cancelBtn = ref<HTMLButtonElement | null>(null)
onMounted(() => cancelBtn.value?.focus())
useEscapeKey(() => emit('cancel'))
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-surface border border-border-strong rounded-xl p-6 max-w-sm w-full mx-4 dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5">
      <p class="text-text mb-6">{{ message }}</p>
      <div class="flex gap-3 justify-end">
        <button
          ref="cancelBtn"
          class="px-4 py-2 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          class="px-4 py-2 rounded-lg bg-danger hover:opacity-85 text-white font-medium transition-colors"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
