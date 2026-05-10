<script setup lang="ts">
import { onMounted, onUnmounted, watch, ref, computed } from 'vue'
import { useListStore } from './stores/listStore'
import { useTodoStore } from './stores/todoStore'
import { useAuthStore } from './stores/authStore'
import { useSettingsStore } from './stores/settingsStore'
import { useSearchStore } from './stores/searchStore'
import {
  useListPrefsStore,
  GRID_COLUMN_OPTIONS,
  type LayoutMode,
  type GridColumns,
} from './stores/listPrefsStore'
import { useCategoryPrefsStore } from './stores/categoryPrefsStore'
import type { ViewType, ItemType, Todo } from './types/todo'
import { apiEvents } from './lib/api'
import AppHeader from './components/AppHeader.vue'
import ListTabs from './components/ListTabs.vue'
import ViewSwitcher from './components/ViewSwitcher.vue'
import ListView from './components/ListView.vue'
import OverallSchedule from './components/OverallSchedule.vue'
import TodoForm from './components/TodoForm.vue'
import CategoryDialog from './components/CategoryDialog.vue'
import LoginPage from './components/LoginPage.vue'
import ChoosePlan from './components/ChoosePlan.vue'
import WelcomeTour from './components/WelcomeTour.vue'
import SearchModal from './components/SearchModal.vue'
import ImportBookmarksDialog from './components/ImportBookmarksDialog.vue'
import DiscoverView from './components/DiscoverView.vue'
import { useDiscoverStore } from './stores/discoverStore'

const listStore = useListStore()
const todoStore = useTodoStore()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const listPrefsStore = useListPrefsStore()
const categoryPrefsStore = useCategoryPrefsStore()
const searchStore = useSearchStore()
const discoverStore = useDiscoverStore()

const highlightItemId = ref<number | null>(null)

const showAddForm = ref(false)
const addType = ref<ItemType>('todo')
const rateLimitMessage = ref('')
const showCategoryDialog = ref(false)
const showImportDialog = ref(false)
const categoryMenu = ref<{ x: number; y: number } | null>(null)

function openCategoryDialog() {
  categoryMenu.value = null
  showCategoryDialog.value = true
}

async function handleCreateCategory(name: string) {
  showCategoryDialog.value = false
  await todoStore.createCategory(listStore.activeList, name)
}

function onMainContextMenu(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (!target) return
  // Only act on genuinely-blank list-page area; let the browser's native menu
  // handle cards, text selections, links, form fields, etc.
  if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return
  if (target.closest('.category-drag-handle, .select-text')) return
  const sel = window.getSelection?.()
  if (sel && sel.toString().length > 0) return
  if (!isCategoryView.value) return
  e.preventDefault()
  categoryMenu.value = { x: e.clientX, y: e.clientY }
}

function closeCategoryMenu() {
  categoryMenu.value = null
}

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
const mode = ref<'lists' | 'calendar' | 'discover'>('lists')
const showColumnsMenu = ref(false)

function toggleCalendar() {
  if (authStore.tier !== 'pro') return
  mode.value = mode.value === 'calendar' ? 'lists' : 'calendar'
}

function toggleDiscover() {
  if (authStore.tier !== 'pro') return
  if (mode.value === 'discover') {
    mode.value = 'lists'
  } else {
    mode.value = 'discover'
    discoverStore.selectSlug(null)
  }
}

function handleClonedToList() {
  // Switch back to Lists so the user lands on their new clone.
  mode.value = 'lists'
  discoverStore.selectSlug(null)
}

// Plan downgrade safety: never strand a Free user on a Pro-only mode.
watch(() => authStore.tier, (tier) => {
  if (tier !== 'pro' && (mode.value === 'calendar' || mode.value === 'discover')) {
    mode.value = 'lists'
  }
})
const layoutMode = computed<LayoutMode>(() => listPrefsStore.get(listStore.activeList).layout)
const gridColumns = computed<GridColumns>(() => listPrefsStore.get(listStore.activeList).columns)
const isCategoryView = computed(() => currentView.value !== 'schedule' && currentView.value !== 'completed')

function setLayout(mode: LayoutMode) {
  listPrefsStore.setLayout(listStore.activeList, mode)
}

function setColumns(n: GridColumns) {
  // A column pick implies grid view — bundle both into one update.
  listPrefsStore.update(listStore.activeList, { layout: 'grid', columns: n })
  showColumnsMenu.value = false
}

function toggleColumnsMenu() {
  showColumnsMenu.value = !showColumnsMenu.value
}

function handleKeydown(e: KeyboardEvent) {
  // Cmd/Ctrl+K: open global search (Pro only). Independent from Alt+T/B/N.
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
    if (showAddForm.value) return
    if (authStore.tier !== 'pro') return
    e.preventDefault()
    if (searchStore.open) searchStore.closeSearch()
    else searchStore.openSearch()
    return
  }
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

async function onSearchSelect(item: Todo) {
  searchStore.closeSearch()
  if (mode.value !== 'lists') mode.value = 'lists'

  const targetView: ViewType = item.status === 1 ? 'completed' : 'all'

  if (item.list_name !== listStore.activeList) {
    listStore.setActiveList(item.list_name)
  }
  if (targetView !== currentView.value) {
    currentView.value = targetView
    todoStore.setView(targetView)
  }
  await todoStore.fetchTodos(item.list_name, targetView)

  // If the item is missing from the current view (snoozed items are filtered
  // out of /api/todos in the 'all' view), surface a hint instead of silently
  // failing to scroll.
  const present = todoStore.todos.find((t) => t.id === item.id)
  if (!present) {
    const now = Math.floor(Date.now() / 1000)
    if (item.snoozed_until && item.snoozed_until > now) {
      const until = new Date(item.snoozed_until * 1000).toLocaleString()
      todoStore.error = `"${item.title}" is snoozed until ${until} — unsnooze it to view it in the list.`
    } else {
      todoStore.error = `"${item.title}" isn't visible in the current view.`
    }
    return
  }

  highlightItemId.value = item.id
}

function clearHighlight() {
  highlightItemId.value = null
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
    await listPrefsStore.loadFromServer()
    await categoryPrefsStore.loadFromServer()
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
    listPrefsStore.reset()
    categoryPrefsStore.reset()
    searchStore.reset()
    discoverStore.reset()
    if (currentId) {
      await loadData()
      await settingsStore.loadFromServer()
      await listPrefsStore.loadFromServer()
      await categoryPrefsStore.loadFromServer()
    }
  }
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  apiEvents.removeEventListener('rate-limited', handleRateLimit)
})

// Re-fetch when active list changes; layout/columns track via computeds.
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

// Welcome tour: show automatically the first time, or whenever the help button
// triggers a replay. Wait for lists to load so item-type targets exist.
const showWelcomeTour = computed(
  () =>
    authStore.isAuthenticated &&
    !authStore.needsPlanChoice &&
    listStore.lists.length > 0 &&
    (settingsStore.replayingWelcome || !settingsStore.hasSeenWelcome)
)

function onTourDone() {
  settingsStore.completeWelcome()
}

function onTourSkip() {
  if (settingsStore.replayingWelcome) {
    settingsStore.dismissReplay()
  } else {
    settingsStore.completeWelcome()
  }
}

</script>

<template>
  <LoginPage v-if="!authStore.isAuthenticated" />
  <ChoosePlan v-else-if="authStore.needsPlanChoice" />
  <div v-else class="min-h-dvh bg-bg text-text flex flex-col isolate">
    <AppHeader
      :calendar-active="mode === 'calendar'"
      :discover-active="mode === 'discover'"
      @add="openAddForm"
      @toggle-calendar="toggleCalendar"
      @toggle-discover="toggleDiscover"
      @search="searchStore.openSearch()"
      @import="showImportDialog = true"
    />

    <!-- List tabs -->
    <div v-if="mode === 'lists'" class="bg-surface/50 border-b border-border px-4 pt-1">
      <ListTabs @select="onListSelect" />
    </div>

    <!-- View switcher -->
    <div v-if="mode === 'lists'" class="px-4 py-1.5 border-b border-border/60 bg-surface/20 flex items-center justify-between gap-4">
      <ViewSwitcher :current="currentView" :counts="todoStore.viewCounts" @change="onViewChange" />

      <div v-if="isCategoryView" class="flex items-center gap-2 shrink-0">
        <button
          title="Create a new category"
          class="px-2.5 py-1 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors whitespace-nowrap"
          @click="openCategoryDialog"
        >
          + New Category
        </button>

      <!-- Layout toggle (category views only) -->
      <div data-tour="layout-controls" class="relative flex rounded-lg border border-border-strong overflow-visible shrink-0">
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
          title="Choose number of grid columns"
          class="px-1 border-l border-border-strong transition-colors"
          :class="layoutMode === 'grid' ? 'bg-accent text-accent-fg hover:bg-accent/90' : 'text-muted hover:text-text hover:bg-surface-hover'"
          @click="toggleColumnsMenu"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
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

        <!-- Columns dropdown -->
        <template v-if="showColumnsMenu">
          <div class="fixed inset-0 z-40" @click="showColumnsMenu = false" @contextmenu.prevent="showColumnsMenu = false" />
          <div
            class="absolute z-50 top-full right-0 mt-1 bg-surface border border-border-strong rounded-lg shadow-lg py-1 min-w-36 dark:inset-ring dark:inset-ring-white/5"
          >
            <div class="px-3 pb-1 pt-0.5 text-[10px] font-semibold tracking-wider uppercase text-muted">
              Grid columns
            </div>
            <button
              v-for="n in GRID_COLUMN_OPTIONS"
              :key="n"
              class="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-hover flex items-center justify-between"
              :class="gridColumns === n && layoutMode === 'grid' ? 'text-accent' : 'text-text'"
              @click="setColumns(n)"
            >
              <span>{{ n }} columns</span>
              <svg
                v-if="gridColumns === n && layoutMode === 'grid'"
                class="size-3.5 shrink-0"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
              </svg>
            </button>
          </div>
        </template>
      </div>
      </div>
    </div>

    <!-- Main content -->
    <main
      class="flex-1 flex flex-col min-h-0 overflow-hidden"
      :class="mode === 'lists' ? 'p-4' : ''"
      @contextmenu="onMainContextMenu"
    >
      <ListView
        v-if="mode === 'lists'"
        :layout="layoutMode"
        :grid-columns="gridColumns"
        :highlight-id="highlightItemId"
        @highlight-cleared="clearHighlight"
      />
      <DiscoverView
        v-else-if="mode === 'discover'"
        @cloned-to-list="handleClonedToList"
      />
      <OverallSchedule v-else />
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

    <!-- New category dialog -->
    <CategoryDialog
      v-if="showCategoryDialog"
      @submit="handleCreateCategory"
      @cancel="showCategoryDialog = false"
    />

    <!-- Welcome tour -->
    <WelcomeTour
      v-if="showWelcomeTour"
      @done="onTourDone"
      @skip="onTourSkip"
    />

    <!-- Global search -->
    <SearchModal
      v-if="searchStore.open"
      @select="onSearchSelect"
      @close="searchStore.closeSearch()"
    />

    <!-- Import bookmarks (Pro) -->
    <ImportBookmarksDialog
      v-if="showImportDialog"
      @close="showImportDialog = false"
    />

    <!-- Right-click context menu -->
    <template v-if="categoryMenu">
      <div class="fixed inset-0 z-40" @click="closeCategoryMenu" @contextmenu.prevent="closeCategoryMenu" />
      <div
        class="fixed z-50 bg-surface border border-border-strong rounded-lg shadow-lg py-1 min-w-44 dark:inset-ring dark:inset-ring-white/5"
        :style="{ left: `${categoryMenu.x}px`, top: `${categoryMenu.y}px` }"
      >
        <button
          class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
          @click="openCategoryDialog"
        >
          <svg class="size-3.5 text-muted shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
          </svg>
          New Category
        </button>
      </div>
    </template>
  </div>
</template>
