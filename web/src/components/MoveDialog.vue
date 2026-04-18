<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'
import { useListStore } from '../stores/listStore'
import { useTodoStore } from '../stores/todoStore'

const props = defineProps<{
  currentList: string
  currentCategory: string
  itemTitle: string
}>()

const emit = defineEmits<{
  move: [payload: { targetList: string; targetCategory: string }]
  cancel: []
}>()

const listStore = useListStore()
const todoStore = useTodoStore()

const NEW_LIST = '__new_list__'
const NEW_CATEGORY = '__new_category__'

const selected = ref(props.currentList)
const newListName = ref('')
const categoryChoice = ref(props.currentCategory)
const newCategoryName = ref('')
const categorySuggestions = ref<string[]>([])

const firstRadio = ref<HTMLInputElement | null>(null)
function setFirstRadio(el: unknown, i: number) {
  if (i === 0) firstRadio.value = el as HTMLInputElement | null
}
onMounted(() => firstRadio.value?.focus())
useEscapeKey(() => emit('cancel'))

const availableCategories = computed(() => {
  // Disallow moving to the same list+category the item is already in.
  if (selected.value === props.currentList) {
    return categorySuggestions.value.filter((c) => c !== props.currentCategory)
  }
  return categorySuggestions.value
})

async function loadCategoriesFor(list: string) {
  categorySuggestions.value = await todoStore.fetchCategoriesFor(list)
  const valid = availableCategories.value
  // Keep current selection if it's still offered; otherwise pick the first available.
  if (categoryChoice.value !== NEW_CATEGORY && !valid.includes(categoryChoice.value)) {
    categoryChoice.value = valid[0] ?? NEW_CATEGORY
  }
}

watch(
  selected,
  async (val) => {
    if (val && val !== NEW_LIST) {
      await loadCategoriesFor(val)
    } else {
      categorySuggestions.value = []
      categoryChoice.value = NEW_CATEGORY
    }
  },
  { immediate: true },
)

function confirm() {
  const targetList = selected.value === NEW_LIST ? newListName.value.trim() : selected.value
  if (!targetList) return
  const targetCategory =
    categoryChoice.value === NEW_CATEGORY
      ? newCategoryName.value.trim()
      : categoryChoice.value
  if (!targetCategory) return
  emit('move', { targetList, targetCategory })
}

const showNewList = () => selected.value === NEW_LIST
const showNewCategory = () => categoryChoice.value === NEW_CATEGORY
const canSubmit = () => {
  if (showNewList() && !newListName.value.trim()) return false
  if (showNewCategory() && !newCategoryName.value.trim()) return false
  if (!selected.value) return false
  // Block moving to the exact same list+category.
  const targetList = showNewList() ? newListName.value.trim() : selected.value
  const targetCategory = showNewCategory() ? newCategoryName.value.trim() : categoryChoice.value
  if (targetList === props.currentList && targetCategory === props.currentCategory) return false
  return true
}
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
    <div class="bg-surface border border-border-strong/60 rounded-xl max-w-sm w-full mx-4 overflow-hidden dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5">
      <!-- Header (matches category card header) -->
      <div class="px-4 py-2.5 border-b border-border-strong/60 bg-surface-hover/40">
        <h3 class="text-sm font-semibold text-muted uppercase tracking-wider truncate">
          Move "{{ itemTitle }}"
        </h3>
      </div>

      <!-- Body -->
      <div class="p-4">
        <div class="text-xs uppercase tracking-wider text-muted mb-2">List</div>
        <div class="space-y-1 mb-4">
          <label
            v-for="(list, i) in listStore.lists"
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
            <span v-if="list === currentList" class="text-xs text-muted">(current)</span>
          </label>

          <label class="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer">
            <input type="radio" v-model="selected" :value="NEW_LIST" class="accent-accent" />
            <span class="text-sm text-muted">New list…</span>
          </label>
        </div>

        <input
          v-if="showNewList()"
          v-model="newListName"
          type="text"
          placeholder="List name"
          class="w-full mb-4 bg-bg border border-border-strong rounded-lg px-3 py-1.5 text-text text-sm focus:outline-none focus:border-accent"
        />

        <div v-if="selected">
          <div class="text-xs uppercase tracking-wider text-muted mb-2">Category</div>
          <select
            v-model="categoryChoice"
            class="w-full bg-bg border border-border-strong rounded-lg px-3 py-1.5 text-text text-sm focus:outline-none focus:border-accent"
          >
            <option v-for="c in availableCategories" :key="c" :value="c">{{ c }}</option>
            <option :value="NEW_CATEGORY">New category…</option>
          </select>

          <input
            v-if="showNewCategory()"
            v-model="newCategoryName"
            type="text"
            placeholder="Category name"
            class="mt-2 w-full bg-bg border border-border-strong rounded-lg px-3 py-1.5 text-text text-sm focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      <!-- Footer -->
      <div class="flex gap-3 justify-end px-4 py-3 border-t border-border-strong/60 bg-surface-hover/20">
        <button
          class="px-4 py-1.5 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors"
          @click="emit('cancel')"
        >
          Cancel
        </button>
        <button
          :disabled="!canSubmit()"
          class="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg text-sm font-medium transition-colors"
          @click="confirm"
        >
          Move
        </button>
      </div>
    </div>
  </div>
</template>
