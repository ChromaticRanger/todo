<script setup lang="ts">
import type { ViewType } from '../types/todo'

type CountKey = 'today' | 'week' | 'month' | 'overdue'

const props = defineProps<{
  current: ViewType
  counts?: Record<CountKey, number>
}>()
const emit = defineEmits<{ change: [view: ViewType] }>()

const views: { key: ViewType; label: string; countKey?: CountKey }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today', countKey: 'today' },
  { key: 'week', label: 'Week', countKey: 'week' },
  { key: 'month', label: 'Month', countKey: 'month' },
  { key: 'overdue', label: 'Overdue', countKey: 'overdue' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'completed', label: 'Completed' },
]

function hasItems(key?: CountKey): boolean {
  return !!key && (props.counts?.[key] ?? 0) > 0
}
</script>

<template>
  <div data-tour="view-switcher" class="flex gap-1 flex-wrap">
    <button
      v-for="v in views"
      :key="v.key"
      class="px-2.5 py-1 rounded-lg text-sm transition-colors inline-flex items-center gap-1.5"
      :class="current === v.key
        ? 'bg-accent text-accent-fg font-medium'
        : 'text-muted hover:text-text hover:bg-surface-hover'"
      @click="emit('change', v.key)"
    >
      {{ v.label }}
      <span
        v-if="hasItems(v.countKey)"
        class="size-1.5 rounded-full"
        :class="current === v.key ? 'bg-accent-fg/80' : 'bg-accent'"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
