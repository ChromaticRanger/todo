<script setup lang="ts">
import type { ViewType } from '../types/todo'

const props = defineProps<{ current: ViewType }>()
const emit = defineEmits<{ change: [view: ViewType] }>()

const views: { key: ViewType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'completed', label: 'Completed' },
]
</script>

<template>
  <div class="flex gap-1 flex-wrap">
    <button
      v-for="v in views"
      :key="v.key"
      class="px-3 py-1.5 rounded-lg text-sm transition-colors"
      :class="current === v.key
        ? 'bg-purple-600 text-white font-medium'
        : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'"
      @click="emit('change', v.key)"
    >
      {{ v.label }}
    </button>
  </div>
</template>
