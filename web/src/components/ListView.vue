<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTodoStore } from '../stores/todoStore'
import CategoryGroup from './CategoryGroup.vue'
import EmptyState from './EmptyState.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const store = useTodoStore()

// For schedule/completed views, show flat list grouped by date or completion date
// For all/today/week/month, group by category
const showFlat = computed(() =>
  store.currentView === 'schedule' || store.currentView === 'completed'
)

const allCategories = computed(() => store.categories)

const confirmDeleteId = ref<number | null>(null)

function formatDate(epoch: number | null): string {
  if (!epoch) return 'Unknown'
  return new Date(epoch * 1000).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

async function handleDelete() {
  if (confirmDeleteId.value === null) return
  await store.deleteTodo(confirmDeleteId.value)
  confirmDeleteId.value = null
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
        class="bg-gray-900 border border-gray-700/60 rounded-xl p-4 group"
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
          <button
            v-if="store.currentView === 'completed'"
            class="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
            title="Delete"
            @click="confirmDeleteId = todo.id"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    v-if="confirmDeleteId !== null"
    :message="`Delete this completed item?`"
    @confirm="handleDelete"
    @cancel="confirmDeleteId = null"
  />
</template>
