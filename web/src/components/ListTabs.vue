<script setup lang="ts">
import { computed, ref } from 'vue'
import draggable from 'vuedraggable'
import { useListStore } from '../stores/listStore'
import { usePlanStore } from '../stores/planStore'
import { useTodoStore } from '../stores/todoStore'
import ConfirmDialog from './ConfirmDialog.vue'

const listStore = useListStore()
const planStore = usePlanStore()
const todoStore = useTodoStore()

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
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto pb-1 flex-shrink-0">
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

  <!-- Delete confirmation -->
  <ConfirmDialog
    v-if="confirmDelete"
    :message="`Delete all todos in &quot;${confirmDelete}&quot;? This cannot be undone.`"
    @confirm="deleteList"
    @cancel="confirmDelete = null"
  />
</template>
