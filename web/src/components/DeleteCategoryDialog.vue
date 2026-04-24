<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'

const props = defineProps<{
  category: string
  itemCount: number
}>()

const emit = defineEmits<{
  move: []
  delete: []
  cancel: []
}>()

const MOVE_TARGET = 'General'

const primaryBtn = ref<HTMLButtonElement | null>(null)
onMounted(() => primaryBtn.value?.focus())
useEscapeKey(() => emit('cancel'))

const isGeneral = computed(() => props.category === MOVE_TARGET)
const hasItems = computed(() => props.itemCount > 0)
const itemWord = computed(() => (props.itemCount === 1 ? 'item' : 'items'))
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-surface border border-border-strong/60 rounded-xl max-w-md w-full mx-4 overflow-hidden dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5">
      <div class="px-4 py-2.5 border-b border-border-strong/60 bg-surface-hover/40">
        <h3 class="text-sm font-semibold text-muted uppercase tracking-wider truncate">
          Delete category "{{ category }}"
        </h3>
      </div>

      <div class="p-4 text-sm text-text space-y-3">
        <template v-if="hasItems">
          <p>
            This category contains
            <span class="font-semibold">{{ itemCount }} {{ itemWord }}</span>.
            What would you like to do with them?
          </p>
          <ul class="text-muted text-xs space-y-1 pl-4 list-disc">
            <li v-if="!isGeneral">
              <span class="text-text">Move to {{ MOVE_TARGET }}</span> keeps every item — only the category is removed.
            </li>
            <li>
              <span class="text-text">Delete everything</span> permanently removes the category
              <span class="font-semibold">and all {{ itemCount }} {{ itemWord }}</span>. This cannot be undone.
            </li>
          </ul>
        </template>
        <template v-else>
          <p>Delete empty category <span class="font-semibold">"{{ category }}"</span>?</p>
        </template>
      </div>

      <div class="flex gap-2 justify-end px-4 py-3 border-t border-border-strong/60 bg-surface-hover/20 flex-wrap">
        <button
          class="px-4 py-1.5 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          v-if="hasItems && !isGeneral"
          ref="primaryBtn"
          class="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors"
          @click="emit('move')"
        >
          Move to {{ MOVE_TARGET }}
        </button>
        <button
          :ref="(el) => { if (!hasItems || isGeneral) primaryBtn = el as HTMLButtonElement | null }"
          class="px-4 py-1.5 rounded-lg bg-danger hover:opacity-85 text-white text-sm font-medium transition-colors"
          @click="emit('delete')"
        >
          {{ hasItems ? 'Delete everything' : 'Delete' }}
        </button>
      </div>
    </div>
  </div>
</template>
