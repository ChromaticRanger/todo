<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Todo } from '../types/todo'
import { Priority, Status } from '../types/todo'
import { useTodoStore } from '../stores/todoStore'
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

const priorityBorderClass = computed(() => {
  switch (props.todo.priority) {
    case Priority.HIGH: return 'border-l-red-500'
    case Priority.LOW: return 'border-l-green-500'
    default: return 'border-l-yellow-500'
  }
})

const priorityLabel = computed(() => {
  switch (props.todo.priority) {
    case Priority.HIGH: return 'High'
    case Priority.LOW: return 'Low'
    default: return 'Med'
  }
})

const priorityBadgeClass = computed(() => {
  switch (props.todo.priority) {
    case Priority.HIGH: return 'bg-red-900/40 text-red-400'
    case Priority.LOW: return 'bg-green-900/40 text-green-400'
    default: return 'bg-yellow-900/40 text-yellow-400'
  }
})

const isCompleted = computed(() => props.todo.status === Status.COMPLETED)

const dueDateStr = computed(() => {
  if (!props.todo.due_date) return null
  const d = new Date(props.todo.due_date * 1000)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
})

const isDueOverdue = computed(() => {
  if (!props.todo.due_date || isCompleted.value) return false
  return props.todo.due_date < Math.floor(Date.now() / 1000)
})

const URL_RE = /https?:\/\/[^\s]+/g

const faviconUrl = computed(() => {
  const match = URL_RE.exec(props.todo.title)
  URL_RE.lastIndex = 0
  if (!match) return null
  try {
    const domain = new URL(match[0]).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`
  } catch {
    return null
  }
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

async function handleMove(targetList: string) {
  await store.moveTodo(props.todo.id, targetList)
  showMove.value = false
}

async function handleDelete() {
  await store.deleteTodo(props.todo.id)
  showConfirm.value = false
}
</script>

<template>
  <div
    class="flex items-start gap-3 p-3 rounded-lg border-l-4 bg-gray-800/60 hover:bg-gray-800 transition-colors group"
    :class="[priorityBorderClass, isCompleted ? 'opacity-60' : '']"
  >
    <!-- Complete toggle -->
    <button
      class="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
      :class="isCompleted
        ? 'bg-purple-600 border-purple-600'
        : 'border-gray-500 hover:border-purple-400'"
      @click="toggleComplete"
      :title="isCompleted ? 'Mark pending' : 'Mark complete'"
    >
      <svg v-if="isCompleted" class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
      </svg>
    </button>

    <!-- Content -->
    <div class="flex-1">
      <div class="flex items-start gap-2">
        <span
          class="text-sm text-gray-100 leading-5 flex-1 flex items-baseline gap-1.5 whitespace-nowrap"
          :class="isCompleted ? 'line-through text-gray-400' : ''"
        >
          <span
            v-if="faviconUrl"
            class="inline-flex items-center justify-center size-5 rounded-full bg-white/90 flex-shrink-0 self-center"
          >
            <img
              :src="faviconUrl"
              class="size-3.5"
              alt=""
              @error="($event.target as HTMLImageElement).parentElement!.style.display = 'none'"
            />
          </span>
          <template v-for="part in titleParts" :key="part.value">
            <a
              v-if="part.type === 'url'"
              :href="part.value"
              target="_blank"
              rel="noopener noreferrer"
              class="text-purple-400 hover:text-purple-300 underline underline-offset-2"
              @click.stop
            >{{ part.value }}</a>
            <template v-else>{{ part.value }}</template>
          </template>
        </span>
        <span class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium" :class="priorityBadgeClass">
          {{ priorityLabel }}
        </span>
      </div>

      <div v-if="todo.description" class="mt-1 text-xs text-gray-400 leading-relaxed">
        {{ todo.description }}
      </div>

      <div class="flex items-center gap-2 mt-1 flex-wrap">
        <span
          v-if="dueDateStr"
          class="text-xs"
          :class="isDueOverdue ? 'text-red-400 font-medium' : 'text-gray-500'"
        >
          {{ isDueOverdue ? '⚠ ' : '' }}{{ dueDateStr }}
        </span>
        <span v-if="repeatStr" class="text-xs text-purple-400">{{ repeatStr }}</span>
      </div>
    </div>

    <!-- Actions (visible on hover) -->
    <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
      <button
        class="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        title="Edit"
        @click="showEdit = true"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
      <button
        class="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-700 transition-colors"
        title="Move to list"
        @click="showMove = true"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      </button>
      <button
        class="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-700 transition-colors"
        title="Delete"
        @click="showConfirm = true"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    :todo-title="todo.title"
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
