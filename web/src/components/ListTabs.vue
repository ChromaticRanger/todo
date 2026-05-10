<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, onUpdated } from 'vue'
import draggable from 'vuedraggable'
import { useListStore } from '../stores/listStore'
import { usePlanStore } from '../stores/planStore'
import { useTodoStore } from '../stores/todoStore'
import { useAuthStore } from '../stores/authStore'
import ConfirmDialog from './ConfirmDialog.vue'
import PublishListModal from './PublishListModal.vue'

const listStore = useListStore()
const planStore = usePlanStore()
const todoStore = useTodoStore()
const authStore = useAuthStore()
const publishingList = ref<string | null>(null)
const publishToast = ref('')

function showPublishToast(msg: string) {
  publishToast.value = msg
  setTimeout(() => {
    if (publishToast.value === msg) publishToast.value = ''
  }, 4000)
}

const maxLists = computed(() => planStore.limits?.maxLists ?? null)
const atListCap = computed(() => {
  if (planStore.tier !== 'free') return false
  const cap = maxLists.value
  if (cap == null) return false
  return listStore.lists.length >= cap
})

const showNewInput = ref(false)
const newName = ref('')
const confirmDelete = ref<string | null>(null)
const editingList = ref<string | null>(null)
const editName = ref('')

const emit = defineEmits<{ select: [list: string] }>()

function selectList(name: string) {
  listStore.setActiveList(name)
  emit('select', name)
}

async function createList() {
  const name = newName.value.trim()
  if (!name) return
  if (atListCap.value) {
    todoStore.error = `You've reached the Free plan list limit (${maxLists.value}). Remove a list or upgrade to Pro.`
    setTimeout(() => {
      if (todoStore.error?.includes('list limit')) todoStore.error = null
    }, 6000)
    showNewInput.value = false
    newName.value = ''
    return
  }
  listStore.addListLocally(name)
  listStore.setActiveList(name)
  emit('select', name)
  newName.value = ''
  showNewInput.value = false
}

function startEdit(list: string) {
  editingList.value = list
  editName.value = list
}

async function confirmRename() {
  const trimmed = editName.value.trim()
  if (!trimmed || !editingList.value) { editingList.value = null; return }
  if (trimmed !== editingList.value) {
    await listStore.renameList(editingList.value, trimmed)
  }
  editingList.value = null
}

function cancelEdit() {
  editingList.value = null
}

async function deleteList() {
  if (!confirmDelete.value) return
  await listStore.deleteList(confirmDelete.value)
  confirmDelete.value = null
}

const draggableLists = computed({
  get: () => listStore.lists,
  set: (value) => listStore.reorderLists(value),
})

// Horizontal scroll arrows: shown only when the tab row overflows.
const scroller = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
const hasOverflow = computed(() => canScrollLeft.value || canScrollRight.value)

function updateScrollState() {
  const el = scroller.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 0
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
}

function scrollByPage(direction: -1 | 1) {
  const el = scroller.value
  if (!el) return
  el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.75), behavior: 'smooth' })
}

let ro: ResizeObserver | null = null
onMounted(() => {
  updateScrollState()
  scroller.value?.addEventListener('scroll', updateScrollState, { passive: true })
  ro = new ResizeObserver(updateScrollState)
  if (scroller.value) ro.observe(scroller.value)
})
onUpdated(updateScrollState)
onBeforeUnmount(() => {
  scroller.value?.removeEventListener('scroll', updateScrollState)
  ro?.disconnect()
})
</script>

<template>
  <div data-tour="list-tabs" class="flex items-center gap-1 pb-1 shrink-0">
    <!-- Scroll-left arrow (only when overflowing) -->
    <button
      v-if="hasOverflow"
      type="button"
      class="shrink-0 p-1 rounded-md text-muted hover:text-text hover:bg-surface-hover/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted disabled:cursor-not-allowed transition-colors"
      :disabled="!canScrollLeft"
      title="Scroll left"
      aria-label="Scroll lists left"
      @click="scrollByPage(-1)"
    >
      <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>

    <div ref="scroller" class="flex items-center gap-1 overflow-x-auto scrollbar-hide min-w-0 flex-1">
    <!-- List tabs -->
    <draggable
      v-model="draggableLists"
      tag="div"
      class="flex items-center gap-1"
      :item-key="(el: string) => el"
      :animation="150"
      handle=".list-tab-handle"
      filter="input,.tab-action"
      :prevent-on-filter="false"
      :delay="200"
      :delay-on-touch-only="true"
      :touch-start-threshold="5"
      ghost-class="opacity-40"
    >
      <template #item="{ element: list }">
    <div
      :key="list"
      class="list-tab-handle group flex items-center gap-2 px-3 py-1 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors border-b-2 cursor-pointer select-none"
      :class="listStore.activeList === list
        ? 'border-accent text-accent bg-surface-hover/60'
        : 'border-transparent text-muted hover:text-text hover:bg-surface-hover/40'"
      @click="selectList(list)"
    >
      <!-- Inline rename input -->
      <input
        v-if="editingList === list"
        v-model="editName"
        type="text"
        class="bg-surface-hover border border-accent rounded px-1.5 py-0.5 text-sm text-text focus:outline-none w-28 cursor-text"
        autofocus
        @click.stop
        @keydown.enter="confirmRename"
        @keydown.esc="cancelEdit"
        @blur="confirmRename"
      />
      <span v-else>{{ list }}</span>

      <template v-if="editingList !== list">
        <!-- Edit / rename icon -->
        <span
          class="tab-action opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-hover hover:text-text transition-all"
          title="Rename list"
          @click.stop="startEdit(list)"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" />
          </svg>
        </span>
        <!-- Publish icon (Pro only) -->
        <span
          v-if="authStore.tier === 'pro'"
          class="tab-action opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-hover hover:text-accent transition-all"
          title="Publish to community"
          @click.stop="publishingList = list"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 6l-4-4m0 0L8 6m4-4v14" />
          </svg>
        </span>
        <!-- Delete icon -->
        <span
          class="tab-action opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-danger-bg hover:text-danger transition-all"
          title="Delete list"
          @click.stop="confirmDelete = list"
        >
          <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      </template>
    </div>
      </template>
    </draggable>

    <!-- New list button/input -->
    <div v-if="!showNewInput">
      <button
        class="px-2.5 py-1 rounded-t-lg text-sm transition-colors border-b-2 border-transparent whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        :class="atListCap
          ? 'text-muted'
          : 'text-muted hover:text-text hover:bg-surface-hover/40'"
        :disabled="atListCap"
        :title="atListCap
          ? `Free plan is capped at ${maxLists} lists — upgrade to Pro for more.`
          : 'Create a new list'"
        @click="showNewInput = true"
      >
        + New list
      </button>
    </div>
    <div v-else class="flex items-center gap-1">
      <input
        v-model="newName"
        type="text"
        placeholder="List name"
        class="bg-surface border border-border-strong rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:border-accent w-36"
        autofocus
        @keydown.enter="createList"
        @keydown.esc="showNewInput = false"
      />
      <button
        class="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm transition-colors"
        @click="createList"
      >Add</button>
      <button
        class="p-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
        @click="showNewInput = false"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    </div>

    <!-- Scroll-right arrow (only when overflowing) -->
    <button
      v-if="hasOverflow"
      type="button"
      class="shrink-0 p-1 rounded-md text-muted hover:text-text hover:bg-surface-hover/40 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted disabled:cursor-not-allowed transition-colors"
      :disabled="!canScrollRight"
      title="Scroll right"
      aria-label="Scroll lists right"
      @click="scrollByPage(1)"
    >
      <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  </div>

  <!-- Delete confirmation -->
  <ConfirmDialog
    v-if="confirmDelete"
    :message="`Delete all todos in &quot;${confirmDelete}&quot;? This cannot be undone.`"
    @confirm="deleteList"
    @cancel="confirmDelete = null"
  />

  <!-- Publish to community -->
  <PublishListModal
    v-if="publishingList"
    :list-name="publishingList"
    @close="publishingList = null"
    @published="(r) => { publishingList = null; showPublishToast(r.updated ? 'Community copy updated.' : 'List published to community.') }"
    @unpublished="() => { publishingList = null; showPublishToast('Removed from community.') }"
  />

  <div
    v-if="publishToast"
    class="fixed bottom-4 right-4 z-50 bg-surface border border-border-strong text-text px-4 py-3 rounded-xl text-sm shadow-xl dark:shadow-none"
  >
    {{ publishToast }}
  </div>
</template>
