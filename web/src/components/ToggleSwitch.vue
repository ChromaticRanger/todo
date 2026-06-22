<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; disabled?: boolean; label?: string }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    :disabled="disabled"
    class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    :class="modelValue ? 'bg-accent' : 'bg-muted/30'"
    @click="toggle"
  >
    <span
      class="inline-block size-5 transform rounded-full bg-white shadow transition-transform"
      :class="modelValue ? 'translate-x-5' : 'translate-x-0.5'"
    />
  </button>
</template>
