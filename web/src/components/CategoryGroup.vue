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
const editing = ref(false)
const editName = ref('')

async function handleAdd(form: TodoFormData) {
  await store.addTodo(listStore.activeList, { ...form, category: props.category })
  showAddForm.value = false
}

function startEdit() {
  editName.value = props.category
  editing.value = true
}

async function confirmRename() {
  const trimmed = editName.value.trim()
  editing.value = false
  if (!trimmed || trimmed === props.category) return
  await store.renameCategory(listStore.activeList, props.category, trimmed)
}

function cancelEdit() {
  editing.value = false
}
</script>

<template>
  <div
    class="flex flex-col bg-gray-900 border border-gray-700/60 rounded-xl overflow-hidden max-h-[calc(100vh-14rem)]"
    :class="layout === 'kanban' ? 'w-max min-w-52 shrink-0' : ''"
  >
    <!-- Category header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700/60 bg-gray-800/40">
      <!-- Inline rename input -->
      <input
        v-if="editing"
        v-model="editName"
        type="text"
        class="bg-gray-700 border border-purple-500 rounded px-1.5 py-0.5 text-sm font-semibold text-gray-300 uppercase tracking-wider focus:outline-none w-36 cursor-text"
        autofocus
        @keydown.enter="confirmRename"
        @keydown.esc="cancelEdit"
        @blur="confirmRename"
      />
      <h3 v-else class="text-sm font-semibold text-gray-300 uppercase tracking-wider">{{ category }}</h3>

      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">{{ todos.length }}</span>
        <!-- Edit / rename icon -->
        <button
          v-if="!editing"
          class="p-1 rounded text-gray-600 hover:text-purple-400 hover:bg-gray-700"
          title="Rename category"
          @click="startEdit"
        >
          <svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474ZM3.75 13.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z" />
          </svg>
        </button>
        <!-- Add todo icon -->
        <button
          class="p-1 rounded text-gray-500 hover:text-purple-400 hover:bg-gray-700"
          title="Add todo to this category"
          @click="showAddForm = true"
        >
          <svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
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
