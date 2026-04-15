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
    <div class="bg-surface border border-border-strong rounded-xl p-6 max-w-sm w-full mx-4 dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5">
      <h3 class="text-text font-semibold mb-4">Move "{{ todoTitle }}"</h3>

      <div class="space-y-2 mb-4">
        <div v-for="(list, i) in otherLists" :key="list">
          <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover cursor-pointer">
            <input
              :ref="i === 0 ? 'firstRadio' : undefined"
              type="radio"
              v-model="selected"
              :value="list"
              @change="showNewInput = false"
              class="accent-accent"
            />
            <span class="text-text">{{ list }}</span>
          </label>
        </div>

        <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover cursor-pointer">
          <input type="radio" v-model="selected" value="__new__" @change="showNewInput = true"
            class="accent-accent" />
          <span class="text-muted">New list…</span>
        </label>
      </div>

      <div v-if="showNewInput" class="mb-4">
        <input
          v-model="newListName"
          type="text"
          placeholder="List name"
          class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
          autofocus
        />
      </div>

      <div class="flex gap-3 justify-end">
        <button
          class="px-4 py-2 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          :disabled="!selected && !newListName.trim()"
          class="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg font-medium transition-colors"
          @click="confirm"
        >
          Move
        </button>
      </div>
    </div>
  </div>
</template>
