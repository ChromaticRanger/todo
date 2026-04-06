<script setup lang="ts">
import { ref } from 'vue'
import { useListStore } from '../stores/listStore'
import ConfirmDialog from './ConfirmDialog.vue'

const listStore = useListStore()

const showNewInput = ref(false)
const newName = ref('')
const confirmDelete = ref<string | null>(null)

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

async function deleteList() {
  if (!confirmDelete.value) return
  await listStore.deleteList(confirmDelete.value)
  confirmDelete.value = null
}
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto pb-1 flex-shrink-0">
    <!-- List tabs -->
    <button
      v-for="list in listStore.lists"
      :key="list"
      class="group flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap transition-colors border-b-2"
      :class="listStore.activeList === list
        ? 'border-purple-500 text-purple-300 bg-gray-800/60'
        : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'"
      @click="selectList(list)"
    >
      {{ list }}
      <span
        class="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-900/40 hover:text-red-400 transition-all"
        @click.stop="confirmDelete = list"
        title="Delete list"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    </button>

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
