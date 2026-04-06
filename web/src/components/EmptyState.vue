<script setup lang="ts">
defineProps<{ view: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-24 text-gray-500">
    <svg class="w-12 h-12 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
    <p class="text-lg font-medium">No todos</p>
    <p class="text-sm mt-1 opacity-70">
      <span v-if="view === 'all'">Add your first todo using the + button</span>
      <span v-else-if="view === 'today'">Nothing due today</span>
      <span v-else-if="view === 'week'">Nothing due this week</span>
      <span v-else-if="view === 'month'">Nothing due this month</span>
      <span v-else-if="view === 'schedule'">No upcoming todos with due dates</span>
      <span v-else>No completed todos</span>
    </p>
  </div>
</template>
