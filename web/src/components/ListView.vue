<script setup lang="ts">
import { computed } from 'vue'
import { useTodoStore } from '../stores/todoStore'
import CategoryGroup from './CategoryGroup.vue'
import EmptyState from './EmptyState.vue'

const store = useTodoStore()

// For schedule/completed views, show flat list grouped by date or completion date
// For all/today/week/month, group by category
const showFlat = computed(() =>
  store.currentView === 'schedule' || store.currentView === 'completed'
)

const allCategories = computed(() => store.categories)

function formatDate(epoch: number | null): string {
  if (!epoch) return 'Unknown'
  return new Date(epoch * 1000).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}
</script>

<template>
  <div class="flex-1 overflow-y-auto">
    <EmptyState v-if="store.todos.length === 0 && !store.loading" :view="store.currentView" />

    <!-- Loading -->
    <div v-if="store.loading" class="flex items-center justify-center py-24">
      <div class="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- Category view (All / Today / Week / Month) -->
    <div v-else-if="!showFlat && store.todos.length > 0" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <CategoryGroup
        v-for="[cat, todos] in store.byCategory"
        :key="cat"
        :category="cat"
        :todos="todos"
        :all-categories="allCategories"
      />
    </div>

    <!-- Flat view (Schedule / Completed) -->
    <div v-else-if="showFlat && store.todos.length > 0" class="space-y-3 max-w-2xl">
      <div
        v-for="todo in store.todos"
        :key="todo.id"
        class="bg-gray-900 border border-gray-700/60 rounded-xl p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs text-gray-500 uppercase tracking-wider">{{ todo.category }}</span>
            </div>
            <p class="text-sm text-gray-100" :class="todo.status === 1 ? 'line-through text-gray-400' : ''">
              {{ todo.title }}
            </p>
            <p v-if="store.currentView === 'schedule' && todo.due_date" class="text-xs text-purple-400 mt-1">
              Due: {{ formatDate(todo.due_date) }}
            </p>
            <p v-if="store.currentView === 'completed' && todo.completed_at" class="text-xs text-gray-500 mt-1">
              Completed: {{ formatDate(todo.completed_at) }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
