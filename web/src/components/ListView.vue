<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, onUpdated } from 'vue'
import { useTodoStore } from '../stores/todoStore'
import CategoryGroup from './CategoryGroup.vue'
import EmptyState from './EmptyState.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const props = defineProps<{ layout?: 'grid' | 'kanban' }>()

const store = useTodoStore()

const showFlat = computed(() =>
  store.currentView === 'schedule' || store.currentView === 'completed'
)

const allCategories = computed(() => store.categories)

const confirmDeleteId = ref<number | null>(null)

// Carousel scroll state (kanban only)
const kanbanRef = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const isDragging = ref(false)

function updateScrollState() {
  const el = kanbanRef.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 0
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollLeft() {
  kanbanRef.value?.scrollBy({ left: -kanbanRef.value.clientWidth, behavior: 'smooth' })
}

function scrollRight() {
  kanbanRef.value?.scrollBy({ left: kanbanRef.value.clientWidth, behavior: 'smooth' })
}

// Click-and-drag panning
const DRAG_THRESHOLD = 5
type DragState = { startX: number; startScroll: number; pointerId: number; dragging: boolean }
let dragState: DragState | null = null

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  // Only when the kanban track is rendered
  const el = kanbanRef.value
  if (!el) return
  const target = e.target as HTMLElement | null
  if (!target) return
  // Scope drag to the main content area — header, tabs, modals are out
  if (!target.closest('main')) return
  // Let interactive elements handle their own clicks
  if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return
  dragState = {
    startX: e.clientX,
    startScroll: el.scrollLeft,
    pointerId: e.pointerId,
    dragging: false,
  }
}

function onPointerMove(e: PointerEvent) {
  const s = dragState
  if (!s) return
  const dx = e.clientX - s.startX
  if (!s.dragging) {
    if (Math.abs(dx) < DRAG_THRESHOLD) return
    s.dragging = true
    isDragging.value = true
    try { kanbanRef.value?.setPointerCapture(s.pointerId) } catch {}
  }
  e.preventDefault()
  kanbanRef.value!.scrollLeft = s.startScroll - dx
}

function onPointerUp(e: PointerEvent) {
  const s = dragState
  if (!s) return
  const wasDragging = s.dragging
  dragState = null
  if (!wasDragging) return
  try { kanbanRef.value?.releasePointerCapture(s.pointerId) } catch {}
  // Swallow the click that follows the drag release
  const suppress = (ev: MouseEvent) => {
    ev.stopPropagation()
    ev.preventDefault()
    window.removeEventListener('click', suppress, true)
  }
  window.addEventListener('click', suppress, true)
  // Clear the flag on next frame so the suppress handler above has already fired
  requestAnimationFrame(() => { isDragging.value = false })
  e.preventDefault()
}

function onPointerCancel() {
  if (dragState?.dragging) isDragging.value = false
  dragState = null
}

onMounted(() => {
  updateScrollState()
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
})
onUpdated(updateScrollState)

function formatDate(epoch: number | null): string {
  if (!epoch) return 'Unknown'
  return new Date(epoch * 1000).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

async function handleDelete() {
  if (confirmDeleteId.value === null) return
  await store.deleteTodo(confirmDeleteId.value)
  confirmDeleteId.value = null
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto">
    <EmptyState v-if="store.todos.length === 0 && !store.loading" :view="store.currentView" />

    <!-- Loading -->
    <div v-if="store.loading" class="flex items-center justify-center py-24">
      <div class="size-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- Category view (All / Today / Week / Month) -->
    <template v-else-if="!showFlat && store.todos.length > 0">

      <!-- Grid layout -->
      <div v-if="props.layout === 'grid'" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CategoryGroup
          v-for="[cat, todos] in store.byCategory"
          :key="cat"
          :category="cat"
          :todos="todos"
          :all-categories="allCategories"
          layout="grid"
        />
      </div>

      <!-- Kanban layout -->
      <div
        v-else
        class="relative min-h-full"
        :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
      >
        <!-- Left carousel button -->
        <button
          v-if="canScrollLeft"
          class="fixed left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-8 rounded-full bg-surface/90 border border-border-strong text-muted hover:text-text hover:bg-surface-hover transition-colors dark:shadow-none shadow-lg"
          @click="scrollLeft"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <!-- Scrollable track -->
        <div
          ref="kanbanRef"
          class="flex gap-4 overflow-x-auto pb-4 items-start scrollbar-hide select-none"
          @scroll="updateScrollState"
        >
          <CategoryGroup
            v-for="[cat, todos] in store.byCategory"
            :key="cat"
            :category="cat"
            :todos="todos"
            :all-categories="allCategories"
            layout="kanban"
          />
        </div>

        <!-- Right carousel button -->
        <button
          v-if="canScrollRight"
          class="fixed right-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center size-8 rounded-full bg-surface/90 border border-border-strong text-muted hover:text-text hover:bg-surface-hover transition-colors dark:shadow-none shadow-lg"
          @click="scrollRight"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

    </template>

    <!-- Flat view (Schedule / Completed) -->
    <div v-else-if="showFlat && store.todos.length > 0" class="space-y-3 max-w-2xl">
      <div
        v-for="todo in store.todos"
        :key="todo.id"
        class="bg-surface border border-border-strong/60 rounded-xl p-4 group dark:inset-ring dark:inset-ring-white/5 dark:shadow-none"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs text-muted uppercase tracking-wider">{{ todo.category }}</span>
            </div>
            <p class="text-sm text-text" :class="todo.status === 1 ? 'line-through text-muted' : ''">
              {{ todo.title }}
            </p>
            <p v-if="store.currentView === 'schedule' && todo.due_date" class="text-xs text-accent mt-1">
              Due: {{ formatDate(todo.due_date) }}
            </p>
            <p v-if="store.currentView === 'completed' && todo.completed_at" class="text-xs text-muted mt-1">
              Completed: {{ formatDate(todo.completed_at) }}
            </p>
          </div>
          <button
            v-if="store.currentView === 'completed'"
            class="p-1 rounded text-muted hover:text-danger hover:bg-surface-hover transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            title="Delete"
            @click="confirmDeleteId = todo.id"
          >
            <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    v-if="confirmDeleteId !== null"
    :message="`Delete this completed item?`"
    @confirm="handleDelete"
    @cancel="confirmDeleteId = null"
  />
</template>
