<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Todo } from '../types/todo'
import { Priority, Status } from '../types/todo'
import { useTodoStore } from '../stores/todoStore'
import TodoForm from './TodoForm.vue'
import MoveDialog from './MoveDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import SnoozeDialog from './SnoozeDialog.vue'
import BookmarkFavicon from './BookmarkFavicon.vue'

const props = defineProps<{
  todo: Todo
  categories: string[]
  currentList: string
}>()

const store = useTodoStore()

const showEdit = ref(false)
const showMove = ref(false)
const showConfirm = ref(false)
const showSnooze = ref(false)

const isTodo = computed(() => props.todo.type === 'todo' || !props.todo.type)
const isBookmark = computed(() => props.todo.type === 'bookmark')
const isNote = computed(() => props.todo.type === 'note')

const priorityBorderClass = computed(() => {
  if (!isTodo.value) return 'border-l-border-strong'
  switch (props.todo.priority) {
    case Priority.HIGH: return 'border-l-danger'
    case Priority.LOW: return 'border-l-green-400'
    default: return 'border-l-blue-500'
  }
})

const isCompleted = computed(() => props.todo.status === Status.COMPLETED)

const dueDateStr = computed(() => {
  if (!props.todo.due_date) return null
  const d = new Date(props.todo.due_date * 1000)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
})

const isDueOverdue = computed(() => {
  if (!props.todo.due_date || isCompleted.value) return false
  return props.todo.due_date < Math.floor(Date.now() / 1000)
})

const URL_RE = /https?:\/\/[^\s]+/g

// Todos don't have a url field — favicon is shown only when the title contains a URL.
const embeddedTitleUrl = computed(() => {
  const match = URL_RE.exec(props.todo.title)
  URL_RE.lastIndex = 0
  return match ? match[0] : null
})

const titleParts = computed(() => {
  const text = props.todo.title
  const parts: { type: 'text' | 'url'; value: string }[] = []
  let last = 0
  for (const match of text.matchAll(URL_RE)) {
    if (match.index! > last) parts.push({ type: 'text', value: text.slice(last, match.index) })
    parts.push({ type: 'url', value: match[0] })
    last = match.index! + match[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })
  return parts
})

const repeatStr = computed(() => {
  if (props.todo.repeat_days > 0) return `↻ ${props.todo.repeat_days}d`
  if (props.todo.repeat_months > 0) return `↻ ${props.todo.repeat_months}mo`
  return null
})

function openBookmark() {
  if (window.getSelection()?.toString()) return
  if (isBookmark.value && props.todo.url) {
    window.open(props.todo.url, '_blank', 'noopener')
  }
}

async function toggleComplete() {
  if (isCompleted.value) {
    await store.uncompleteTodo(props.todo.id)
  } else {
    await store.completeTodo(props.todo.id)
  }
}

async function handleEdit(form: Parameters<typeof store.updateTodo>[1]) {
  await store.updateTodo(props.todo.id, form)
  showEdit.value = false
}

async function handleMove(payload: { targetList: string; targetCategory: string }) {
  await store.moveTodo(props.todo.id, payload.targetList, payload.targetCategory)
  showMove.value = false
}

async function handleDelete() {
  await store.deleteTodo(props.todo.id)
  showConfirm.value = false
}

async function handleSnooze(payload: { snoozed_until: number | null; due_date?: number | null }) {
  await store.snoozeTodo(props.todo.id, payload.snoozed_until, payload.due_date)
  showSnooze.value = false
}
</script>

<template>
  <!-- Bookmark item -->
  <div
    v-if="isBookmark"
    class="flex items-center gap-3 px-3 py-2 rounded-lg border-l-8 bg-accent/5 hover:bg-accent/10 dark:bg-accent/15 dark:hover:bg-accent/25 transition-colors group cursor-pointer"
    :class="priorityBorderClass"
    @click="openBookmark"
  >
    <span
      class="item-drag-handle flex-shrink-0 -ml-1 text-muted cursor-grab active:cursor-grabbing"
      title="Drag to reorder"
      @click.stop
    >
      <svg class="size-3.5" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="6" cy="3" r="1.2" /><circle cx="10" cy="3" r="1.2" />
        <circle cx="6" cy="8" r="1.2" /><circle cx="10" cy="8" r="1.2" />
        <circle cx="6" cy="13" r="1.2" /><circle cx="10" cy="13" r="1.2" />
      </svg>
    </span>
    <BookmarkFavicon :url="todo.url" :title="todo.title" size="md" />

    <!-- Content -->
    <div class="flex-1 min-w-0 select-text">
      <div class="text-sm text-text leading-5 truncate">{{ todo.title }}</div>
      <div v-if="todo.description" class="mt-0.5 text-xs text-muted leading-relaxed truncate">
        {{ todo.description }}
      </div>
    </div>

    <!-- Actions (visible on hover) -->
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" @click.stop>
      <button
        class="p-1 rounded text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Edit"
        @click="showEdit = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Move to list"
        @click="showMove = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
      <button
        class="p-1 rounded text-muted hover:text-danger hover:bg-surface-hover transition-colors"
        title="Delete"
        @click="showConfirm = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Note item -->
  <div
    v-else-if="isNote"
    class="flex items-start gap-3 px-3 py-2 rounded-lg border-l-8 bg-warning-bg/30 hover:bg-warning-bg/50 dark:bg-warning-bg/60 dark:hover:bg-warning-bg/80 transition-colors group"
    :class="priorityBorderClass"
  >
    <span
      class="item-drag-handle flex-shrink-0 self-center -ml-1 text-muted cursor-grab active:cursor-grabbing"
      title="Drag to reorder"
    >
      <svg class="size-3.5" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="6" cy="3" r="1.2" /><circle cx="10" cy="3" r="1.2" />
        <circle cx="6" cy="8" r="1.2" /><circle cx="10" cy="8" r="1.2" />
        <circle cx="6" cy="13" r="1.2" /><circle cx="10" cy="13" r="1.2" />
      </svg>
    </span>
    <!-- Note icon -->
    <span class="mt-0.5 flex-shrink-0 size-5 flex items-center justify-center text-muted">
      <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </span>

    <!-- Content -->
    <div class="flex-1 min-w-0 select-text">
      <div class="text-sm text-text leading-5 font-medium">{{ todo.title }}</div>
      <pre v-if="todo.description" class="mt-0.5 text-xs text-muted leading-relaxed whitespace-pre-wrap font-sans">{{ todo.description }}</pre>
    </div>

    <!-- Actions (visible on hover) -->
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      <button
        class="p-1 rounded text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Edit"
        @click="showEdit = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Move to list"
        @click="showMove = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
      <button
        class="p-1 rounded text-muted hover:text-danger hover:bg-surface-hover transition-colors"
        title="Delete"
        @click="showConfirm = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Todo item (default) -->
  <div
    v-else
    class="flex items-center gap-3 px-3 py-2 rounded-lg border-l-8 bg-surface-hover/40 hover:bg-surface-hover dark:bg-surface-hover/80 transition-colors group"
    :class="[priorityBorderClass, isCompleted ? 'opacity-60' : '']"
  >
    <span
      class="item-drag-handle flex-shrink-0 -ml-1 text-muted cursor-grab active:cursor-grabbing"
      title="Drag to reorder"
    >
      <svg class="size-3.5" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="6" cy="3" r="1.2" /><circle cx="10" cy="3" r="1.2" />
        <circle cx="6" cy="8" r="1.2" /><circle cx="10" cy="8" r="1.2" />
        <circle cx="6" cy="13" r="1.2" /><circle cx="10" cy="13" r="1.2" />
      </svg>
    </span>
    <!-- Complete toggle -->
    <button
      class="flex-shrink-0 size-5 rounded-full border-2 flex items-center justify-center transition-colors"
      :class="isCompleted
        ? 'bg-accent border-accent'
        : 'border-border-strong hover:border-accent'"
      @click="toggleComplete"
      :title="isCompleted ? 'Mark pending' : 'Mark complete'"
    >
      <svg v-if="isCompleted" class="size-3 text-accent-fg" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
      </svg>
    </button>

    <!-- Content -->
    <div class="flex-1 select-text">
      <span
        class="text-sm text-text leading-5 flex items-baseline gap-1.5 whitespace-nowrap"
        :class="isCompleted ? 'line-through text-muted' : ''"
      >
        <BookmarkFavicon
          v-if="embeddedTitleUrl"
          :url="embeddedTitleUrl"
          :title="todo.title"
          size="xs"
          class="self-center"
        />
        <template v-for="part in titleParts" :key="part.value">
          <a
            v-if="part.type === 'url'"
            :href="part.value"
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent hover:text-accent-hover underline underline-offset-2"
            @click.stop
          >{{ part.value }}</a>
          <template v-else>{{ part.value }}</template>
        </template>
      </span>

      <div v-if="todo.description" class="mt-0.5 text-xs text-muted leading-relaxed">
        {{ todo.description }}
      </div>

      <div class="flex items-center gap-2 mt-0.5 flex-wrap">
        <span
          v-if="dueDateStr"
          class="text-xs"
          :class="isDueOverdue ? 'text-danger font-medium' : 'text-muted'"
        >
          {{ isDueOverdue ? '⚠ ' : '' }}{{ dueDateStr }}
        </span>
        <span v-if="repeatStr" class="text-xs text-accent">{{ repeatStr }}</span>
      </div>
    </div>

    <!-- Actions (visible on hover) -->
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      <button
        class="p-1 rounded text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Edit"
        @click="showEdit = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        v-if="!isCompleted"
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Remind me later"
        @click="showSnooze = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 2m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      <button
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Move to list"
        @click="showMove = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
      <button
        class="p-1 rounded text-muted hover:text-danger hover:bg-surface-hover transition-colors"
        title="Delete"
        @click="showConfirm = true"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
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

  <SnoozeDialog
    v-if="showSnooze"
    :todo="todo"
    @submit="handleSnooze"
    @cancel="showSnooze = false"
  />
</template>
