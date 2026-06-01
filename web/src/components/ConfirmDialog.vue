<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'

withDefaults(
  defineProps<{ message: string; confirmLabel?: string; title?: string }>(),
  { confirmLabel: 'Delete', title: 'Are you sure?' }
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
  <div class="modal-backdrop">
    <div class="modal-card max-w-sm">
      <div class="flex gap-4 p-5">
        <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger/15 text-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-6" aria-hidden="true">
            <path
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="text-base font-semibold text-text">{{ title }}</h3>
          <p class="mt-1 text-sm text-muted">{{ message }}</p>
        </div>
      </div>
      <div class="modal-footer justify-end">
        <button ref="cancelBtn" class="btn-ghost" @click="emit('cancel')">
          Cancel
        </button>
        <button class="btn-danger" @click="emit('confirm')">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
