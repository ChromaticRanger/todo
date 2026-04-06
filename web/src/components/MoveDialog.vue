<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'
import { useListStore } from '../stores/listStore'

const props = defineProps<{
  currentList: string
  todoTitle: string
}>()

const emit = defineEmits<{
  move: [targetList: string]
  cancel: []
}>()

const listStore = useListStore()
const selected = ref('')
const newListName = ref('')
const showNewInput = ref(false)

const otherLists = listStore.lists.filter((l) => l !== props.currentList)

const firstRadio = ref<HTMLInputElement | null>(null)
onMounted(() => firstRadio.value?.focus())
useEscapeKey(() => emit('cancel'))

function confirm() {
  const target = showNewInput.value ? newListName.value.trim() : selected.value
  if (!target) return
  emit('move', target)
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
      <h3 class="text-gray-100 font-semibold mb-4">Move "{{ todoTitle }}"</h3>

      <div class="space-y-2 mb-4">
        <div v-for="(list, i) in otherLists" :key="list">
          <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700 cursor-pointer">
            <input
              :ref="i === 0 ? 'firstRadio' : undefined"
              type="radio"
              v-model="selected"
              :value="list"
              @change="showNewInput = false"
              class="accent-purple-500"
            />
            <span class="text-gray-200">{{ list }}</span>
          </label>
        </div>

        <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-700 cursor-pointer">
          <input type="radio" v-model="selected" value="__new__" @change="showNewInput = true"
            class="accent-purple-500" />
          <span class="text-gray-400">New list…</span>
        </label>
      </div>

      <div v-if="showNewInput" class="mb-4">
        <input
          v-model="newListName"
          type="text"
          placeholder="List name"
          class="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-purple-500"
          autofocus
        />
      </div>

      <div class="flex gap-3 justify-end">
        <button
          class="px-4 py-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          :disabled="!selected && !newListName.trim()"
          class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
          @click="confirm"
        >
          Move
        </button>
      </div>
    </div>
  </div>
</template>
