<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref } from 'vue'
import { useListStore } from './stores/listStore'
import { useTodoStore } from './stores/todoStore'
import { useAuthStore } from './stores/authStore'
import type { ViewType } from './types/todo'
import ListTabs from './components/ListTabs.vue'
import ViewSwitcher from './components/ViewSwitcher.vue'
import ListView from './components/ListView.vue'
import TodoForm from './components/TodoForm.vue'
import LoginPage from './components/LoginPage.vue'

const listStore = useListStore()
const todoStore = useTodoStore()
const authStore = useAuthStore()

const showAddForm = ref(false)
const currentView = ref<ViewType>('all')

function handleKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && e.key === 'a' && !showAddForm.value) {
    e.preventDefault()
    showAddForm.value = true
  }
}

async function loadData() {
  await listStore.fetchLists()
  if (listStore.lists.length > 0) {
    await todoStore.fetchTodos(listStore.activeList, currentView.value)
  }
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown)
  if (authStore.isAuthenticated) {
    await loadData()
  }
})

watch(() => authStore.isAuthenticated, async (authenticated) => {
  if (authenticated) {
    await loadData()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

// Re-fetch when active list changes
watch(() => listStore.activeList, (list) => {
  todoStore.fetchTodos(list, currentView.value)
})

async function onViewChange(view: ViewType) {
  currentView.value = view
  todoStore.setView(view)
  await todoStore.fetchTodos(listStore.activeList, view)
}

async function onListSelect(list: string) {
  await todoStore.fetchTodos(list, currentView.value)
}

async function handleAdd(form: Parameters<typeof todoStore.addTodo>[1]) {
  await todoStore.addTodo(listStore.activeList, form)
  showAddForm.value = false
  // Refresh list names in case a new list was created
  await listStore.fetchLists()
}

</script>

<template>
  <LoginPage v-if="!authStore.isAuthenticated" />
  <div v-else class="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-3">
        <svg class="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4" />
        </svg>
        <h1 class="text-lg font-semibold text-gray-100">Todo Dashboard</h1>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
          @click="showAddForm = true"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Todo
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 text-sm transition-colors"
          @click="authStore.logout()"
          title="Sign out"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </header>

    <!-- List tabs -->
    <div class="bg-gray-900/50 border-b border-gray-800 px-4 pt-2">
      <ListTabs @select="onListSelect" />
    </div>

    <!-- View switcher -->
    <div class="px-4 py-3 border-b border-gray-800/60 bg-gray-900/20">
      <ViewSwitcher :current="currentView" @change="onViewChange" />
    </div>

    <!-- Main content -->
    <main class="flex-1 flex flex-col min-h-0 overflow-hidden p-4">
      <ListView />
    </main>

    <!-- Error toast -->
    <div
      v-if="todoStore.error || listStore.error"
      class="fixed bottom-4 right-4 bg-red-900/90 border border-red-700 text-red-200 px-4 py-3 rounded-xl text-sm max-w-sm shadow-xl"
    >
      {{ todoStore.error || listStore.error }}
    </div>

    <!-- Add form modal -->
    <TodoForm
      v-if="showAddForm"
      :categories="todoStore.categories"
      @submit="handleAdd"
      @cancel="showAddForm = false"
    />
  </div>
</template>
