<script setup lang="ts">
import { ref } from 'vue'
import type { Todo } from '../types/todo'
import TodoItem from './TodoItem.vue'
import TodoForm from './TodoForm.vue'
import type { TodoFormData } from '../types/todo'
import { useTodoStore } from '../stores/todoStore'
import { useListStore } from '../stores/listStore'

const props = defineProps<{
  category: string
  todos: Todo[]
  allCategories: string[]
  layout?: 'grid' | 'kanban'
}>()

const store = useTodoStore()
const listStore = useListStore()
const showAddForm = ref(false)

async function handleAdd(form: TodoFormData) {
  await store.addTodo(listStore.activeList, { ...form, category: props.category })
  showAddForm.value = false
}
</script>

<template>
  <div
    class="flex flex-col bg-gray-900 border border-gray-700/60 rounded-xl overflow-hidden max-h-[calc(100vh-14rem)]"
    :class="layout === 'kanban' ? 'w-max min-w-52 shrink-0' : ''"
  >
    <!-- Category header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700/60 bg-gray-800/40">
      <h3 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">{{ category }}</h3>
      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">{{ todos.length }}</span>
        <button
          class="p-1 rounded text-gray-500 hover:text-purple-400 hover:bg-gray-700 transition-colors"
          title="Add todo to this category"
          @click="showAddForm = true"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Todos list -->
    <div class="p-3 space-y-2 flex-1 overflow-y-auto scrollbar-thin">
      <TodoItem
        v-for="todo in todos"
        :key="todo.id"
        :todo="todo"
        :categories="allCategories"
        :current-list="listStore.activeList"
      />

      <div v-if="todos.length === 0" class="text-xs text-gray-600 text-center py-2">
        No items
      </div>
    </div>
  </div>

  <!-- Add form modal -->
  <TodoForm
    v-if="showAddForm"
    :categories="allCategories"
    :default-category="category"
    @submit="handleAdd"
    @cancel="showAddForm = false"
  />
</template>
