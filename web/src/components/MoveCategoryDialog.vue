<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'
import { useListStore } from '../stores/listStore'
import { useTodoStore } from '../stores/todoStore'

const props = defineProps<{
  category: string
  currentList: string
}>()

const emit = defineEmits<{
  move: [targetList: string]
  cancel: []
}>()

const listStore = useListStore()
const todoStore = useTodoStore()

const NEW_LIST = '__new_list__'

// The current list isn't offered — moving a category onto itself is a no-op.
const targets = computed(() => listStore.lists.filter((l) => l !== props.currentList))

const selected = ref(targets.value[0] ?? NEW_LIST)
const newListName = ref('')
const targetCategories = ref<string[]>([])

const firstRadio = ref<HTMLInputElement | null>(null)
function setFirstRadio(el: unknown, i: number) {
  if (i === 0) firstRadio.value = el as HTMLInputElement | null
}
onMounted(() => firstRadio.value?.focus())
useEscapeKey(() => emit('cancel'))

/** The list this move will land in — typing an existing list's name into the
 *  "New list" box targets that list, so resolve both paths the same way. */
const targetList = computed(() =>
  selected.value === NEW_LIST ? newListName.value.trim() : selected.value
)

const isExistingList = computed(() => listStore.lists.includes(targetList.value))

watch(
  targetList,
  async (list) => {
    targetCategories.value = list && isExistingList.value
      ? await todoStore.fetchCategoriesFor(list)
      : []
  },
  { immediate: true },
)

/** Mirrors the server's naming: first free of "Work", "Work(1)", "Work(2)", … */
function nextFreeName(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 1
  while (taken.has(`${base}(${i})`)) i++
  return `${base}(${i})`
}

const landingName = computed(() =>
  nextFreeName(props.category, new Set(targetCategories.value))
)
const willBeRenamed = computed(() => landingName.value !== props.category)

const canSubmit = computed(() => {
  if (!targetList.value) return false
  return targetList.value !== props.currentList
})

function confirm() {
  if (!canSubmit.value) return
  emit('move', targetList.value)
}
</script>

<template>
  <div class="modal-backdrop">
    <div class="modal-card max-w-sm">
      <!-- Header (matches category card header) -->
      <div class="border-b border-border-strong/60 bg-surface-hover/40 px-4 py-2.5">
        <h3 class="truncate text-sm font-semibold uppercase tracking-wider text-muted">
          Move category "{{ category }}"
        </h3>
      </div>

      <!-- Body -->
      <div class="p-4">
        <!-- No item count here on purpose: the card only counts what's on
             screen, while the move takes everything in the category. -->
        <p class="text-sm text-text mb-4">
          Everything in this category moves across, completed and snoozed items included.
        </p>

        <div class="text-xs uppercase tracking-wider text-muted mb-2">Move to list</div>
        <div class="space-y-1 mb-4">
          <label
            v-for="(list, i) in targets"
            :key="list"
            class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer"
          >
            <input
              :ref="(el) => setFirstRadio(el, i)"
              type="radio"
              v-model="selected"
              :value="list"
              class="accent-accent"
            />
            <span class="text-sm text-text">{{ list }}</span>
          </label>

          <label class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer">
            <input type="radio" v-model="selected" :value="NEW_LIST" class="accent-accent" />
            <span class="text-sm text-muted">New list…</span>
          </label>
        </div>

        <input
          v-if="selected === NEW_LIST"
          v-model="newListName"
          type="text"
          name="new-list"
          placeholder="List name"
          class="field-input"
        />

        <!-- Name clash: the category arrives under a free name rather than
             merging into the one already there. -->
        <p v-if="willBeRenamed" class="mt-3 text-xs text-muted">
          <span class="text-text">{{ targetList }}</span> already has a category called
          <span class="text-text">{{ category }}</span>, so this one arrives as
          <span class="font-semibold text-text">{{ landingName }}</span>. You can rename it
          afterwards.
        </p>
      </div>

      <!-- Footer -->
      <div class="modal-footer justify-end">
        <button class="btn-ghost" @click="emit('cancel')">
          Cancel
        </button>
        <button :disabled="!canSubmit" class="btn-primary" @click="confirm">
          Move
        </button>
      </div>
    </div>
  </div>
</template>
