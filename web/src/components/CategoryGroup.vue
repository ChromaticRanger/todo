<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Todo, ItemType } from '../types/todo'
import TodoItem from './TodoItem.vue'
import TodoForm from './TodoForm.vue'
import BookmarkTile from './BookmarkTile.vue'
import DeleteCategoryDialog from './DeleteCategoryDialog.vue'
import type { TodoFormData } from '../types/todo'
import { useTodoStore } from '../stores/todoStore'
import { useListStore } from '../stores/listStore'
import { useCategoryPrefsStore } from '../stores/categoryPrefsStore'

const props = defineProps<{
  category: string
  todos: Todo[]
  allCategories: string[]
  layout?: 'grid' | 'kanban'
}>()

const store = useTodoStore()
const listStore = useListStore()
const categoryPrefsStore = useCategoryPrefsStore()
const showAddForm = ref(false)
const addType = ref<ItemType>('todo')
const showTypeMenu = ref(false)
const editing = ref(false)
const editName = ref('')
const confirmDelete = ref(false)

const itemLayout = computed(
  () => categoryPrefsStore.get(listStore.activeList, props.category).itemLayout,
)
const bookmarks = computed(() => props.todos.filter(t => t.type === 'bookmark'))
const nonBookmarks = computed(() => props.todos.filter(t => t.type !== 'bookmark'))

function toggleItemLayout() {
  categoryPrefsStore.setItemLayout(
    listStore.activeList,
    props.category,
    itemLayout.value === 'grid' ? 'list' : 'grid',
  )
}

function openAddForm(type: ItemType) {
  addType.value = type
  showTypeMenu.value = false
  showAddForm.value = true
}

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

async function handleDelete() {
  confirmDelete.value = false
  await store.deleteCategory(listStore.activeList, props.category)
}

async function handleMoveToGeneral() {
  confirmDelete.value = false
  await store.mergeCategory(listStore.activeList, props.category, 'General')
}
</script>

<template>
  <div
    class="flex flex-col bg-surface border border-border-strong/60 rounded-xl overflow-hidden max-h-[calc(100vh-14rem)] dark:inset-ring dark:inset-ring-white/5 dark:shadow-none"
    :class="layout === 'kanban' ? 'w-max min-w-52 shrink-0' : ''"
  >
    <!-- Category header (drag handle) -->
    <div class="category-drag-handle flex items-center justify-between px-3 py-1.5 border-b border-border-strong/60 bg-surface-hover/40 cursor-grab active:cursor-grabbing">
      <!-- Inline rename input -->
      <input
        v-if="editing"
        v-model="editName"
        type="text"
        class="bg-surface-hover border border-accent rounded px-1.5 py-0.5 text-sm font-semibold text-muted uppercase tracking-wider focus:outline-none w-36 cursor-text"
        autofocus
        @keydown.enter="confirmRename"
        @keydown.esc="cancelEdit"
        @blur="confirmRename"
      />
      <h3 v-else class="text-sm font-semibold text-muted uppercase tracking-wider">{{ category }}</h3>

      <div class="flex items-center gap-2">
        <span class="text-xs text-muted">{{ todos.length }}</span>
        <!-- Item layout toggle (list / grid) -->
        <button
          v-if="!editing"
          class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover"
          :title="itemLayout === 'grid' ? 'Switch to list layout' : 'Switch to grid layout'"
          @click="toggleItemLayout"
        >
          <svg v-if="itemLayout === 'list'" class="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Zm7 0a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V3ZM2 10a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3Zm7 0a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3Z" />
          </svg>
          <svg v-else class="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 4.25A.75.75 0 0 1 2.75 3.5h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.25Zm0 3.75A.75.75 0 0 1 2.75 7.25h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8Zm.75 3a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H2.75Z" />
          </svg>
        </button>
        <!-- Edit / rename icon -->
        <button
          v-if="!editing"
          class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover"
          title="Rename category"
          @click="startEdit"
        >
          <svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L6.75 6.774a2.75 2.75 0 0 0-.596.892l-.848 2.047a.75.75 0 0 0 .98.98l2.047-.848a2.75 2.75 0 0 0 .892-.596l4.261-4.262a1.75 1.75 0 0 0 0-2.474ZM3.75 13.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z" />
          </svg>
        </button>

        <!-- Delete category icon -->
        <button
          v-if="!editing"
          class="p-1 rounded text-muted hover:text-danger hover:bg-danger-bg"
          title="Delete category"
          @click="confirmDelete = true"
        >
          <svg class="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>

        <!-- Add item button with type dropdown -->
        <div class="relative">
          <button
            class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover"
            title="Add item"
            @click="showTypeMenu = !showTypeMenu"
          >
            <svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
            </svg>
          </button>

          <!-- Type picker menu -->
          <div
            v-if="showTypeMenu"
            class="absolute right-0 top-full mt-1 z-20 bg-surface border border-border-strong rounded-lg shadow-lg py-1 min-w-36"
          >
            <button
              class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
              @click="openAddForm('todo')"
            >
              <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Todo
            </button>
            <button
              class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
              @click="openAddForm('bookmark')"
            >
              <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Bookmark
            </button>
            <button
              class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
              @click="openAddForm('note')"
            >
              <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Note
            </button>
          </div>

          <!-- Click-outside overlay to close menu -->
          <div
            v-if="showTypeMenu"
            class="fixed inset-0 z-10"
            @click="showTypeMenu = false"
          />
        </div>
      </div>
    </div>

    <!-- Items area -->
    <div class="p-3 flex-1 overflow-y-auto scrollbar-thin">
      <template v-if="itemLayout === 'list'">
        <div class="space-y-2">
          <TodoItem
            v-for="todo in todos"
            :key="todo.id"
            :todo="todo"
            :categories="allCategories"
            :current-list="listStore.activeList"
          />
        </div>
      </template>
      <template v-else>
        <div v-if="bookmarks.length > 0" class="flex flex-wrap gap-1.5">
          <BookmarkTile
            v-for="todo in bookmarks"
            :key="todo.id"
            :todo="todo"
            :categories="allCategories"
            :current-list="listStore.activeList"
          />
        </div>
        <div
          v-if="nonBookmarks.length > 0"
          class="space-y-2"
          :class="bookmarks.length > 0 ? 'mt-3' : ''"
        >
          <TodoItem
            v-for="todo in nonBookmarks"
            :key="todo.id"
            :todo="todo"
            :categories="allCategories"
            :current-list="listStore.activeList"
          />
        </div>
      </template>

      <div v-if="todos.length === 0" class="text-xs text-muted text-center py-2">
        No items
      </div>
    </div>
  </div>

  <!-- Add form modal -->
  <TodoForm
    v-if="showAddForm"
    :categories="allCategories"
    :default-category="category"
    :initial-type="addType"
    @submit="handleAdd"
    @cancel="showAddForm = false"
  />

  <!-- Delete category dialog -->
  <DeleteCategoryDialog
    v-if="confirmDelete"
    :category="category"
    :item-count="todos.length"
    @move="handleMoveToGeneral"
    @delete="handleDelete"
    @cancel="confirmDelete = false"
  />
</template>
