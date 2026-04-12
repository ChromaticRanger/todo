<script setup lang="ts">
import { ref } from 'vue'
import { useListStore } from '../stores/listStore'
import ConfirmDialog from './ConfirmDialog.vue'

const listStore = useListStore()

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
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto pb-1 flex-shrink-0">
    <!-- List tabs -->
    <div
      v-for="list in listStore.lists"
      :key="list"
      class="group flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors border-b-2 cursor-pointer select-none"
      :class="listStore.activeList === list
        ? 'border-purple-500 text-purple-300 bg-gray-800/60'
        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'"
      @click="selectList(list)"
    >
      <!-- Inline rename input -->
      <input
        v-if="editingList === list"
        v-model="editName"
        type="text"
        class="bg-gray-700 border border-purple-500 rounded px-1.5 py-0.5 text-sm text-gray-100 focus:outline-none w-28 cursor-text"
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
          class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-700 hover:text-gray-200 transition-all"
          title="Rename list"
          @click.stop="startEdit(list)"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" />
          </svg>
        </span>
        <!-- Delete icon -->
        <span
          class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-900/40 hover:text-red-400 transition-all"
          title="Delete list"
          @click.stop="confirmDelete = list"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      </template>
    </div>

    <!-- New list button/input -->
    <div v-if="!showNewInput">
      <button
        class="px-3 py-2 rounded-t-lg text-sm text-gray-600 hover:text-gray-300 hover:bg-gray-800/40 transition-colors border-b-2 border-transparent whitespace-nowrap"
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
        class="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-purple-500 w-36"
        autofocus
        @keydown.enter="createList"
        @keydown.esc="showNewInput = false"
      />
      <button
        class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm transition-colors"
        @click="createList"
      >Add</button>
      <button
        class="p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-700 transition-colors"
        @click="showNewInput = false"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
