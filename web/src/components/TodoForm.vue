<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Todo, TodoFormData, ItemType } from '../types/todo'
import { Priority } from '../types/todo'
import { useEscapeKey } from '../composables/useEscapeKey'

const props = defineProps<{
  initial?: Todo
  categories: string[]
  defaultCategory?: string
  initialType?: ItemType
}>()

const emit = defineEmits<{
  submit: [form: TodoFormData]
  cancel: []
}>()

const type = ref<ItemType>(props.initial?.type ?? props.initialType ?? 'todo')
const title = ref(props.initial?.title ?? '')
const description = ref(props.initial?.description ?? '')
const url = ref(props.initial?.url ?? '')
const priority = ref<Priority>(props.initial?.priority ?? Priority.MEDIUM)
const dueStr = ref(
  props.initial?.due_date
    ? new Date(props.initial.due_date * 1000).toISOString().split('T')[0]
    : ''
)
const repeatUnit = ref<'days' | 'months'>(
  (props.initial?.repeat_months ?? 0) > 0 ? 'months' : 'days'
)
const repeatValue = ref(
  (props.initial?.repeat_months ?? 0) > 0
    ? props.initial!.repeat_months
    : props.initial?.repeat_days ?? 0
)

const isEdit = computed(() => !!props.initial)

const formTitle = computed(() => {
  const action = isEdit.value ? 'Edit' : 'Add'
  if (type.value === 'bookmark') return `${action} Bookmark`
  if (type.value === 'note') return `${action} Note`
  return `${action} Todo`
})

// Category: use a <select> for existing categories + an "Other" option for custom entry.
const initialCategory = props.initial?.category ?? props.defaultCategory ?? 'General'
const knownCategories = computed(() => {
  const cats = [...props.categories]
  if (!cats.includes('General')) cats.unshift('General')
  return cats
})
const isInitialCustom = computed(
  () => initialCategory !== '' && !knownCategories.value.includes(initialCategory)
)
const selectedCategory = ref(isInitialCustom.value ? '__other__' : initialCategory)
const customCategory = ref(isInitialCustom.value ? initialCategory : '')

const effectiveCategory = computed(() =>
  selectedCategory.value === '__other__'
    ? customCategory.value.trim() || 'General'
    : selectedCategory.value
)

const canSubmit = computed(() => {
  if (!title.value.trim()) return false
  if (type.value === 'bookmark' && !url.value.trim()) return false
  return true
})

function submit() {
  if (!canSubmit.value) return

  const due_date = dueStr.value
    ? Math.floor(new Date(dueStr.value + 'T00:00:00Z').getTime() / 1000)
    : null

  const rd = type.value === 'todo' ? (repeatUnit.value === 'days' ? repeatValue.value : 0) : 0
  const rm = type.value === 'todo' ? (repeatUnit.value === 'months' ? repeatValue.value : 0) : 0

  emit('submit', {
    title: title.value.trim(),
    description: description.value.trim(),
    category: effectiveCategory.value,
    priority: priority.value,
    due_date: type.value === 'todo' ? due_date : null,
    repeat_days: rd,
    repeat_months: rm,
    type: type.value,
    url: type.value === 'bookmark' ? url.value.trim() : null,
  })
}

const titleInput = ref<HTMLInputElement | null>(null)
const urlInput = ref<HTMLInputElement | null>(null)
onMounted(() => {
  if (type.value === 'bookmark') {
    urlInput.value?.focus()
  } else {
    titleInput.value?.focus()
  }
})
useEscapeKey(() => emit('cancel'))

const priorityLabels = [
  { value: Priority.LOW, label: 'Low' },
  { value: Priority.MEDIUM, label: 'Medium' },
  { value: Priority.HIGH, label: 'High' },
]
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-surface border border-border-strong rounded-xl w-full max-w-lg dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5 max-h-screen overflow-y-auto">
      <div class="p-6">
        <h3 class="text-text font-semibold text-lg mb-5">
          {{ formTitle }}
        </h3>

        <form @submit.prevent="submit" class="space-y-4">

          <!-- Bookmark: URL first -->
          <div v-if="type === 'bookmark'">
            <label class="block text-xs text-muted mb-1 uppercase tracking-wider">URL *</label>
            <input
              v-model="url"
              type="url"
              placeholder="https://example.com"
              class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
              ref="urlInput"
            />
          </div>

          <!-- Title (all types) -->
          <div>
            <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Title *</label>
            <input
              v-model="title"
              type="text"
              :placeholder="type === 'bookmark' ? 'Bookmark title' : type === 'note' ? 'Note title' : 'What needs to be done?'"
              class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
              ref="titleInput"
            />
          </div>

          <!-- Description / Body -->
          <div>
            <label class="block text-xs text-muted mb-1 uppercase tracking-wider">
              {{ type === 'note' ? 'Body' : 'Description' }}
            </label>
            <textarea
              v-model="description"
              :rows="type === 'note' ? 5 : 2"
              :placeholder="type === 'note' ? 'Note content…' : 'Optional details…'"
              class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <!-- Category (all types) -->
          <div>
            <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Category</label>
            <select
              v-model="selectedCategory"
              class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
            >
              <option v-for="c in knownCategories" :key="c" :value="c">{{ c }}</option>
              <option value="__other__">Other…</option>
            </select>
            <input
              v-if="selectedCategory === '__other__'"
              v-model="customCategory"
              type="text"
              placeholder="Category name"
              class="mt-2 w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <!-- Todo-only fields: Priority, Due date, Repeat -->
          <template v-if="type === 'todo'">
            <div>
              <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Priority</label>
              <select
                v-model="priority"
                class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
              >
                <option v-for="p in priorityLabels" :key="p.value" :value="p.value">
                  {{ p.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Due Date</label>
              <input
                v-model="dueStr"
                type="date"
                class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
              />
            </div>

            <div>
              <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Repeat</label>
              <div class="flex gap-2">
                <input
                  v-model.number="repeatValue"
                  type="number"
                  min="0"
                  placeholder="0"
                  class="w-20 bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
                />
                <select
                  v-model="repeatUnit"
                  class="flex-1 bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
                >
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
              </div>
              <p v-if="repeatValue > 0" class="text-xs text-accent mt-1">
                Repeats every {{ repeatValue }} {{ repeatUnit }}
              </p>
            </div>
          </template>

          <div class="flex gap-3 justify-end mt-6">
            <button
              type="button"
              class="px-4 py-2 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
              @click="emit('cancel')"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="!canSubmit"
              class="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-accent-fg font-medium transition-colors"
            >
              {{ isEdit ? 'Save' : 'Add' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
