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
  <div class="modal-backdrop">
    <div class="modal-card max-w-sm">
      <div class="border-b border-border-strong/60 bg-surface-hover/40 px-4 py-2.5">
        <h3 class="text-sm font-semibold uppercase tracking-wider text-muted">New category</h3>
      </div>
      <div class="p-4">
        <input
          ref="input"
          v-model="name"
          type="text"
          name="category"
          placeholder="Category name"
          class="field-input"
          @keydown.enter="submit"
        />
      </div>
      <div class="modal-footer justify-end">
        <button class="btn-ghost" @click="emit('cancel')">
          Cancel
        </button>
        <button :disabled="!name.trim()" class="btn-primary" @click="submit">
          Create
        </button>
      </div>
    </div>
  </div>
</template>
