<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref, computed } from 'vue'
import { useListStore } from './stores/listStore'
import { useTodoStore } from './stores/todoStore'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import type { ViewType, ItemType } from './types/todo'

type LayoutMode = 'grid' | 'kanban'

function getStoredLayout(list: string): LayoutMode {
  try {
    const stored = JSON.parse(localStorage.getItem('list-layouts') || '{}')
    return stored[list] === 'grid' ? 'grid' : 'kanban'
  } catch {
    return 'kanban'
  }
}

function storeLayout(list: string, mode: LayoutMode) {
  try {
    const stored = JSON.parse(localStorage.getItem('list-layouts') || '{}')
    stored[list] = mode
    localStorage.setItem('list-layouts', JSON.stringify(stored))
  } catch {}
}
import { apiEvents } from './lib/api'
import AppHeader from './components/AppHeader.vue'
import ListTabs from './components/ListTabs.vue'
import ViewSwitcher from './components/ViewSwitcher.vue'
import ListView from './components/ListView.vue'
import TodoForm from './components/TodoForm.vue'
import LoginPage from './components/LoginPage.vue'
import ChoosePlan from './components/ChoosePlan.vue'

const listStore = useListStore()
const todoStore = useTodoStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()

const showAddForm = ref(false)
const addType = ref<ItemType>('todo')
const rateLimitMessage = ref('')

function handleRateLimit(e: Event) {
  const detail = (e as CustomEvent<{ retryAfter?: string | null }>).detail
  const suffix = detail?.retryAfter ? ` Retry in ${detail.retryAfter}s.` : ''
  rateLimitMessage.value = `Too many requests — slow down.${suffix}`
  setTimeout(() => (rateLimitMessage.value = ''), 5000)
}

function openAddForm(type: ItemType) {
  addType.value = type
  showAddForm.value = true
}
const currentView = ref<ViewType>('all')
const layoutMode = ref<LayoutMode>(getStoredLayout(listStore.activeList))
const isCategoryView = computed(() => currentView.value !== 'schedule' && currentView.value !== 'completed')

function setLayout(mode: LayoutMode) {
  layoutMode.value = mode
  storeLayout(listStore.activeList, mode)
}

function handleKeydown(e: KeyboardEvent) {
  if (!e.altKey || e.ctrlKey || e.metaKey || showAddForm.value) return
  const key = e.key.toLowerCase()
  if (key === 't') {
    e.preventDefault()
    openAddForm('todo')
  } else if (key === 'b') {
    e.preventDefault()
    openAddForm('bookmark')
  } else if (key === 'n') {
    e.preventDefault()
    openAddForm('note')
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
  apiEvents.addEventListener('rate-limited', handleRateLimit)
  if (authStore.isAuthenticated && !authStore.needsPlanChoice) {
    await loadData()
    await settingsStore.loadFromServer()
  }
})

// Watching the user identity (not just auth status) so we also reset when
// one user logs out and a different user signs in on the same tab.
watch(
  () => (authStore.needsPlanChoice ? null : authStore.user?.id ?? null),
  async (currentId, previousId) => {
    if (currentId === previousId) return
    // User identity changed (including going to/from null). Purge per-user stores.
    listStore.reset()
    todoStore.reset()
    if (currentId) {
      await loadData()
      await settingsStore.loadFromServer()
    }
  }
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  apiEvents.removeEventListener('rate-limited', handleRateLimit)
})

// Re-fetch when active list changes and restore its layout preference
watch(() => listStore.activeList, (list) => {
  todoStore.fetchTodos(list, currentView.value)
  layoutMode.value = getStoredLayout(list)
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
  <ChoosePlan v-else-if="authStore.needsPlanChoice" />
  <div v-else class="min-h-dvh bg-bg text-text flex flex-col isolate">
    <AppHeader @add="openAddForm" />

    <!-- List tabs -->
    <div class="bg-surface/50 border-b border-border px-4 pt-1">
      <ListTabs @select="onListSelect" />
    </div>

    <!-- View switcher -->
    <div class="px-4 py-1.5 border-b border-border/60 bg-surface/20 flex items-center justify-between gap-4">
      <ViewSwitcher :current="currentView" @change="onViewChange" />

      <!-- Layout toggle (category views only) -->
      <div v-if="isCategoryView" class="flex rounded-lg border border-border-strong overflow-hidden shrink-0">
        <button
          title="Grid view"
          class="px-2.5 py-1.5 transition-colors"
          :class="layoutMode === 'grid' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text hover:bg-surface-hover'"
          @click="setLayout('grid')"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
          </svg>
        </button>
        <button
          title="Kanban view"
          class="px-2.5 py-1.5 border-l border-border-strong transition-colors"
          :class="layoutMode === 'kanban' ? 'bg-accent text-accent-fg' : 'text-muted hover:text-text hover:bg-surface-hover'"
          @click="setLayout('kanban')"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Main content -->
    <main class="flex-1 flex flex-col min-h-0 overflow-hidden p-4">
      <ListView :layout="layoutMode" />
    </main>

    <!-- Error toast -->
    <div
      v-if="todoStore.error || listStore.error"
      role="alert"
      class="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-danger-bg border-2 border-danger text-danger-fg px-5 py-4 rounded-xl text-base font-medium max-w-xl shadow-2xl flex items-start gap-3"
    >
      <svg class="size-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span class="flex-1">{{ todoStore.error || listStore.error }}</span>
      <button
        type="button"
        class="shrink-0 text-danger-fg/70 hover:text-danger-fg"
        :title="'Dismiss'"
        @click="todoStore.error = null; listStore.error = null"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Rate-limit toast -->
    <div
      v-if="rateLimitMessage"
      class="fixed bottom-4 left-4 bg-surface border border-border-strong text-text px-4 py-3 rounded-xl text-sm max-w-sm shadow-xl dark:shadow-none"
    >
      {{ rateLimitMessage }}
    </div>

    <!-- Add form modal -->
    <TodoForm
      v-if="showAddForm"
      :categories="todoStore.categories"
      :initial-type="addType"
      @submit="handleAdd"
      @cancel="showAddForm = false"
    />
  </div>
</template>
