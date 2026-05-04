<script setup lang="ts">
import { ref } from 'vue'
import type { Todo } from '../types/todo'
import { useTodoStore } from '../stores/todoStore'
import BookmarkFavicon from './BookmarkFavicon.vue'
import TodoForm from './TodoForm.vue'
import MoveDialog from './MoveDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{
  todo: Todo
  categories: string[]
  currentList: string
}>()

const store = useTodoStore()

const showEdit = ref(false)
const showMove = ref(false)
const showConfirm = ref(false)
const isDeleting = ref(false)

async function handleEdit(form: Parameters<typeof store.updateTodo>[1]) {
  await store.updateTodo(props.todo.id, form)
  showEdit.value = false
}

async function handleMove(payload: { targetList: string; targetCategory: string }) {
  await store.moveTodo(props.todo.id, payload.targetList, payload.targetCategory)
  showMove.value = false
}

async function handleDelete() {
  showConfirm.value = false
  isDeleting.value = true
  await new Promise(r => setTimeout(r, 220))
  await store.deleteTodo(props.todo.id)
}
</script>

<template>
  <div
    data-item-type="bookmark"
    class="relative group transition duration-200 ease-out"
    :class="isDeleting ? 'opacity-0 scale-90 pointer-events-none' : ''"
  >
    <!-- Drag handle (hover-revealed, top-left) -->
    <span
      class="item-drag-handle absolute bottom-0 left-0 z-10 p-0.5 rounded-md bg-surface/95 border border-border-strong/40 shadow-sm text-muted cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      title="Drag to reorder"
      @click.stop.prevent
    >
      <svg class="size-3" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="6" cy="3" r="1.2" /><circle cx="10" cy="3" r="1.2" />
        <circle cx="6" cy="8" r="1.2" /><circle cx="10" cy="8" r="1.2" />
        <circle cx="6" cy="13" r="1.2" /><circle cx="10" cy="13" r="1.2" />
      </svg>
    </span>
    <!-- Action overlay (hover-revealed, top-right) -->
    <div
      class="absolute top-0 right-0 z-10 flex items-center gap-0.5 p-0.5 rounded-md bg-surface/95 border border-border-strong/40 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <button
        class="p-0.5 rounded text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Edit"
        @click.stop.prevent="showEdit = true"
      >
        <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        class="p-0.5 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Move to list"
        @click.stop.prevent="showMove = true"
      >
        <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
      <button
        class="p-0.5 rounded text-muted hover:text-danger hover:bg-surface-hover transition-colors"
        title="Delete"
        @click.stop.prevent="showConfirm = true"
      >
        <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>

    <!-- Clickable tile -->
    <a
      :href="todo.url ?? undefined"
      target="_blank"
      rel="noopener noreferrer"
      :title="todo.title"
      class="flex flex-col items-center w-16 rounded-lg p-1 hover:bg-surface-hover transition-colors"
    >
      <BookmarkFavicon :url="todo.url" :title="todo.title" size="lg" />
      <span class="mt-1 w-full text-center text-[11px] leading-tight text-text truncate">
        {{ todo.title }}
      </span>
    </a>
  </div>

  <!-- Modals -->
  <TodoForm
    v-if="showEdit"
    :initial="todo"
    :categories="categories"
    @submit="handleEdit"
    @cancel="showEdit = false"
  />

  <MoveDialog
    v-if="showMove"
    :current-list="currentList"
    :current-category="todo.category"
    :item-title="todo.title"
    @move="handleMove"
    @cancel="showMove = false"
  />

  <ConfirmDialog
    v-if="showConfirm"
    :message="`Delete &quot;${todo.title}&quot;?`"
    @confirm="handleDelete"
    @cancel="showConfirm = false"
  />
</template>
