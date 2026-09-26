<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Todo } from '../types/todo'
import { Status, keyOf } from '../types/todo'
import { useTodoStore } from '../stores/todoStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useListStore } from '../stores/listStore'
import { useAuthStore } from '../stores/authStore'
import { priorityBorderClass as borderClassFor } from '../lib/priorityClass'
import { colorVar } from '../lib/eventColor'
import { renderMarkdown } from '../lib/markdown'
import TodoForm from './TodoForm.vue'
import MoveDialog from './MoveDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import SnoozeDialog from './SnoozeDialog.vue'
import BookmarkFavicon from './BookmarkFavicon.vue'

const props = defineProps<{
  todo: Todo
  categories: string[]
  currentList: string
  highlightId?: number | null
}>()

const emit = defineEmits<{
  'highlight-cleared': []
  'jump-to-calendar': [todo: Todo]
}>()

const store = useTodoStore()
const settingsStore = useSettingsStore()
const listStore = useListStore()
const authStore = useAuthStore()

const rootEl = ref<HTMLElement | null>(null)
const flashing = ref(false)
let flashTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.highlightId,
  (id) => {
    if (id == null || id !== props.todo.id) return
    void nextTick(() => {
      rootEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      flashing.value = true
      if (flashTimer) clearTimeout(flashTimer)
      flashTimer = setTimeout(() => {
        flashing.value = false
        flashTimer = null
        emit('highlight-cleared')
      }, 1500)
    })
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (flashTimer) clearTimeout(flashTimer)
})

const showEdit = ref(false)
const showMove = ref(false)
const showConfirm = ref(false)
const showSnooze = ref(false)
const isDeleting = ref(false)

const isTodo = computed(() => props.todo.type === 'todo' || !props.todo.type)
const isBookmark = computed(() => props.todo.type === 'bookmark')
const isNote = computed(() => props.todo.type === 'note')

// Notes accept Markdown in the description; render once per change rather
// than on every re-render. Plain-text bodies stay safe — markdown-it just
// wraps them in <p>.
const noteBodyHtml = computed(() => isNote.value ? renderMarkdown(props.todo.description) : '')

const priorityBorderClass = computed(() =>
  isTodo.value ? borderClassFor(props.todo.priority) : 'border-l-border-strong'
)

// A per-item colour (set in the edit popup) tints the row background, matching
// how the calendar chips render it. Left border keeps showing priority. `--evt`
// is consumed by the `.item-tint` class in style.css.
const hasColor = computed(() => props.todo.color != null)
const colorTintStyle = computed(() => hasColor.value ? colorVar(props.todo.color) : undefined)

const isCompleted = computed(() => props.todo.status === Status.COMPLETED)

const dueDateStr = computed(() => {
  if (!props.todo.due_date) return null
  return new Date(props.todo.due_date * 1000).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
})

const isDueOverdue = computed(() => {
  if (!props.todo.due_date || isCompleted.value) return false
  // A past event has taken place — it isn't "overdue" in the actionable sense.
  if (props.todo.type === 'event') return false
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

// In an All Lists windowed view, todos from other lists surface alongside the
// active list's items — label them with their own list so their origin is clear.
// Null when the item already belongs to the active list (the normal case).
//
// The comparison must go through keyOf(): on a shared list the row's
// `list_name` is the OWNER's name for it, while the active list is the share
// key, so comparing names directly makes every item look foreign.
const foreignListKey = computed(() => {
  const key = keyOf(props.todo)
  return key && key !== props.currentList ? key : null
})

/** What to call that list in the UI — shared lists show the owner's name for it. */
const foreignList = computed(() =>
  foreignListKey.value ? listStore.displayName(foreignListKey.value) : null
)

// Jump to the item's own list. Switching the active list triggers App's
// activeList watcher, which refetches the current view for that list.
function goToForeignList() {
  if (foreignListKey.value) listStore.setActiveList(foreignListKey.value)
}

function openBookmark() {
  if (window.getSelection()?.toString()) return
  if (isBookmark.value && props.todo.url) {
    window.open(props.todo.url, '_blank', 'noopener')
  }
}

/**
 * Items in a list shared with us that we're not allowed to change.
 *
 * The guard has to sit in front of the UI, not just the store: the delete flow
 * plays a 220ms fade-out before it ever calls the store, so a rejection at that
 * point leaves the row visually gone until the next refresh. Telling the user
 * up front is both truthful and avoids the phantom delete.
 */
const readOnly = computed(() => {
  // Keyed off the ITEM, not the active tab: once shared items mix into Today
  // and Week the active list is one of your own, but the item still isn't.
  if (props.todo.list_key == null) return false
  if (props.todo.can_write === false) return true
  return !listStore.canWrite(props.todo.list_key)
})
const readOnlyReason = computed(() => {
  const owner = props.todo.owner_name || 'someone else'
  return `View only — this list is shared by ${owner}, so you can’t change its items.`
})

/** Returns true (and explains why) when the action must not proceed. */
function blockedByReadOnly(): boolean {
  if (!readOnly.value) return false
  store.setErrorWithTimeout(readOnlyReason.value)
  return true
}

async function toggleComplete() {
  if (blockedByReadOnly()) return
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

// Honor the "confirm before deleting" preference: when off, delete in one click.
function requestDelete() {
  if (blockedByReadOnly()) return
  if (settingsStore.confirmBeforeDelete) showConfirm.value = true
  else void handleDelete()
}

async function handleDelete() {
  showConfirm.value = false
  isDeleting.value = true
  await new Promise(r => setTimeout(r, 220))
  try {
    await store.deleteTodo(props.todo.id)
  } finally {
    // The fade-out runs before the request. If the delete didn't happen, the
    // row is still there and must become visible again — otherwise it looks
    // deleted until the next refresh.
    if (store.todos.some((t) => t.id === props.todo.id)) isDeleting.value = false
  }
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
    ref="rootEl"
    data-item-type="bookmark"
    class="flex items-center gap-3 px-3 py-2 rounded-lg border-l-8 bg-accent/5 hover:bg-accent/10 dark:bg-accent/15 dark:hover:bg-accent/25 transition duration-200 ease-out group cursor-pointer"
    :class="[
      priorityBorderClass,
      isDeleting ? 'opacity-0 scale-95 -translate-x-2 pointer-events-none' : '',
      flashing ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : '',
    ]"
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
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity flex-shrink-0" @click.stop>
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Edit"
        @click="!blockedByReadOnly() && (showEdit = true)"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Move to list"
        @click="!blockedByReadOnly() && (showMove = true)"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-danger hover:bg-surface-hover transition-colors"
        title="Delete"
        @click="requestDelete()"
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
    ref="rootEl"
    data-item-type="note"
    class="flex items-start gap-3 px-3 py-2 rounded-lg border-l-8 bg-warning-bg/30 hover:bg-warning-bg/50 dark:bg-warning-bg/60 dark:hover:bg-warning-bg/80 transition duration-200 ease-out group"
    :class="[
      priorityBorderClass,
      isDeleting ? 'opacity-0 scale-95 -translate-x-2 pointer-events-none' : '',
      flashing ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : '',
    ]"
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
      <div class="text-sm text-text leading-5 font-medium break-words">{{ todo.title }}</div>
      <!-- Note body is Markdown. v-html is safe here because markdown-it
           is configured with html:false (raw <script>/<iframe> are escaped). -->
      <div
        v-if="todo.description"
        class="note-markdown mt-0.5 text-xs text-muted leading-relaxed break-words"
        v-html="noteBodyHtml"
      ></div>
    </div>

    <!-- Actions (visible on hover) -->
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity flex-shrink-0">
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Edit"
        @click="!blockedByReadOnly() && (showEdit = true)"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Move to list"
        @click="!blockedByReadOnly() && (showMove = true)"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-danger hover:bg-surface-hover transition-colors"
        title="Delete"
        @click="requestDelete()"
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
    ref="rootEl"
    data-item-type="todo"
    class="flex items-center gap-3 px-3 py-2 rounded-lg border-l-8 transition duration-200 ease-out group"
    :class="[
      priorityBorderClass,
      hasColor ? 'item-tint' : 'bg-surface-hover/40 hover:bg-surface-hover dark:bg-surface-hover/80',
      isDeleting ? 'opacity-0 scale-95 -translate-x-2 pointer-events-none' : (isCompleted ? 'opacity-60' : ''),
      flashing ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : '',
    ]"
    :style="colorTintStyle"
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
    <!-- Completion state. Kept visible when read-only — a viewer still needs to
         see what's done — but inert: no hover affordance, no click. -->
    <button
      class="flex-shrink-0 size-5 rounded-full border-2 flex items-center justify-center transition-colors"
      :class="[
        isCompleted ? 'bg-accent border-accent' : 'border-border-strong',
        readOnly ? 'cursor-default' : (isCompleted ? '' : 'hover:border-accent'),
      ]"
      :disabled="readOnly"
      @click="toggleComplete"
      :title="readOnly
        ? (isCompleted ? 'Completed' : 'Not completed')
        : (isCompleted ? 'Mark pending' : 'Mark complete')"
    >
      <svg v-if="isCompleted" class="size-3 text-accent-fg" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
      </svg>
    </button>

    <!-- Content -->
    <div class="flex-1 min-w-0 select-text">
      <span
        class="text-sm text-text leading-5 break-words"
        :class="isCompleted ? 'line-through text-muted' : ''"
      >
        <BookmarkFavicon
          v-if="embeddedTitleUrl"
          :url="embeddedTitleUrl"
          :title="todo.title"
          size="xs"
          class="align-middle mr-1"
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

      <div v-if="todo.description" class="mt-0.5 text-xs text-muted leading-relaxed break-words">
        {{ todo.description }}
      </div>

      <div class="flex items-center gap-2 mt-0.5 flex-wrap">
        <!-- Shared-list marker. Shown wherever the item appears, including
             inside your own Today/Week, so another person's work is never
             mistaken for your own. Icon + text, not colour alone. -->
        <span
          v-if="todo.list_key"
          class="inline-flex items-center gap-1 text-xs text-accent bg-accent/10 rounded px-1.5 py-0.5"
          :title="`Shared by ${todo.owner_name ?? 'someone else'}`"
          :aria-label="`Shared by ${todo.owner_name ?? 'someone else'}`"
        >
          <svg class="size-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span class="truncate max-w-28">{{ todo.owner_name ?? 'Shared' }}</span>
        </span>
        <!-- Who added this. Only present on shared lists, and only when it
             wasn't the person looking at it. -->
        <span
          v-if="todo.created_by_name"
          class="inline-flex items-center gap-1 text-xs text-muted"
          :title="`Added by ${todo.created_by_name}`"
          :aria-label="`Added by ${todo.created_by_name}`"
        >
          <span
            class="flex size-4 items-center justify-center rounded-full bg-accent/15 text-[9px] font-semibold text-accent"
            aria-hidden="true"
          >{{ todo.created_by_name.charAt(0).toUpperCase() }}</span>
          <span class="truncate max-w-24">{{ todo.created_by_name }}</span>
        </span>
        <button
          v-if="foreignListKey"
          type="button"
          class="inline-flex items-center gap-1 text-xs text-muted bg-surface-hover hover:bg-accent/15 hover:text-accent rounded px-1.5 py-0.5 max-w-40 transition-colors cursor-pointer"
          :title="`Go to list: ${foreignList}`"
          @click.stop="goToForeignList"
        >
          <svg class="size-3 shrink-0 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <span class="truncate">{{ foreignList }}</span>
        </button>
        <span
          v-if="dueDateStr"
          class="inline-flex items-center gap-1 text-xs"
          :class="isDueOverdue ? 'text-danger font-medium' : 'text-muted'"
        >
          <button
            v-if="authStore.tier === 'pro'"
            type="button"
            class="shrink-0 hover:text-accent transition-colors cursor-pointer"
            :title="`Show “${todo.title}” in the calendar`"
            aria-label="Show in calendar"
            @click.stop="emit('jump-to-calendar', todo)"
          >
            <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
          <span>{{ isDueOverdue ? '⚠ ' : '' }}{{ dueDateStr }}</span>
        </span>
        <span v-if="repeatStr" class="text-xs text-accent">{{ repeatStr }}</span>
      </div>
    </div>

    <!-- Actions (visible on hover) -->
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 touch:opacity-100 transition-opacity flex-shrink-0">
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Edit"
        @click="!blockedByReadOnly() && (showEdit = true)"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        v-if="!isCompleted && !readOnly"
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Remind me later"
        @click="!blockedByReadOnly() && (showSnooze = true)"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 2m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-accent hover:bg-surface-hover transition-colors"
        title="Move to list"
        @click="!blockedByReadOnly() && (showMove = true)"
      >
        <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
      <button
        v-if="!readOnly"
        class="p-1 rounded text-muted hover:text-danger hover:bg-surface-hover transition-colors"
        title="Delete"
        @click="requestDelete()"
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
