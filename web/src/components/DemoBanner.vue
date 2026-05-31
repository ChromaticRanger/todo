<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  formatted: string
  remainingSeconds: number
  onSignUp: () => void
}>()

// In the final ten seconds, switch to a louder warning style so visitors
// notice the demo's about to end before the modal pops.
const urgent = computed(() => props.remainingSeconds <= 10)
</script>

<template>
  <div
    class="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-sm transition-colors"
    :class="urgent
      ? 'bg-warning-bg text-warning-fg'
      : 'bg-accent text-accent-fg'"
    role="status"
    aria-live="polite"
  >
    <span class="font-semibold">Demo session</span>
    <span class="opacity-80">explore freely — this account is temporary</span>
    <span class="opacity-60" aria-hidden="true">·</span>
    <span class="tabular-nums">Ends in {{ formatted }}</span>
    <button
      type="button"
      class="ml-1 underline underline-offset-2 hover:no-underline font-medium"
      @click="onSignUp"
    >
      Sign up
    </button>
  </div>
</template>
