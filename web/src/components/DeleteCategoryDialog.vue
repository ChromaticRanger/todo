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
  <div class="modal-backdrop">
    <div class="modal-card max-w-md">
      <div class="border-b border-border-strong/60 bg-surface-hover/40 px-4 py-2.5">
        <h3 class="truncate text-sm font-semibold uppercase tracking-wider text-muted">
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

      <div class="modal-footer flex-wrap justify-end">
        <button class="btn-ghost" @click="emit('cancel')">
          Cancel
        </button>
        <button
          v-if="hasItems && !isGeneral"
          ref="primaryBtn"
          class="btn-primary"
          @click="emit('move')"
        >
          Move to {{ MOVE_TARGET }}
        </button>
        <button
          :ref="(el) => { if (!hasItems || isGeneral) primaryBtn = el as HTMLButtonElement | null }"
          class="btn-danger"
          @click="emit('delete')"
        >
          {{ hasItems ? 'Delete everything' : 'Delete' }}
        </button>
      </div>
    </div>
  </div>
</template>
