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
  initialDue?: number
  initialDurationSeconds?: number
}>()

const emit = defineEmits<{
  submit: [form: TodoFormData]
  cancel: []
  delete: []
}>()

const type = ref<ItemType>(props.initial?.type ?? props.initialType ?? 'todo')
const title = ref(props.initial?.title ?? '')
const description = ref(props.initial?.description ?? '')
const url = ref(props.initial?.url ?? '')
const priority = ref<Priority>(props.initial?.priority ?? Priority.MEDIUM)
function epochToDatetimeLocalStr(epoch: number): string {
  const d = new Date(epoch * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const dueStr = ref(
  props.initial?.due_date
    ? epochToDatetimeLocalStr(props.initial.due_date)
    : props.initialDue != null
      ? epochToDatetimeLocalStr(props.initialDue)
      : ''
)

// Event end time. Pre-fills from initial.due_date + duration_seconds (edit),
// or from initialDue + initialDurationSeconds (new event from right-click).
// Blank otherwise — the user can fill it in when promoting a legacy event.
const DEFAULT_NEW_EVENT_DURATION_SEC = 1800
function computeInitialEndStr(): string {
  if (props.initial?.due_date != null && (props.initial.duration_seconds ?? 0) > 0) {
    return epochToDatetimeLocalStr(props.initial.due_date + (props.initial.duration_seconds ?? 0))
  }
  if (!props.initial && props.initialDue != null) {
    const dur = props.initialDurationSeconds ?? DEFAULT_NEW_EVENT_DURATION_SEC
    return epochToDatetimeLocalStr(props.initialDue + dur)
  }
  return ''
}
const endStr = ref(computeInitialEndStr())
const repeatUnit = ref<'days' | 'months'>(
  (props.initial?.repeat_months ?? 0) > 0 ? 'months' : 'days'
)
const repeatValue = ref(
  (props.initial?.repeat_months ?? 0) > 0
    ? props.initial!.repeat_months
    : props.initial?.repeat_days ?? 0
)

// Events recur via a small preset list (Weekly / Monthly / Yearly) plus an
// optional end date. The presets map to the same repeat_days / repeat_months
// columns todos use, so a series is one row regardless of how many times it
// will fire — the server expands occurrences on read.
type EventRecur = 'none' | 'weekly' | 'monthly' | 'yearly'
function inferEventRecur(rd: number, rm: number): EventRecur {
  if (rd === 7 && rm === 0) return 'weekly'
  if (rd === 0 && rm === 1) return 'monthly'
  if (rd === 0 && rm === 12) return 'yearly'
  return 'none'
}
function presetToRepeat(p: EventRecur): { days: number; months: number } {
  if (p === 'weekly') return { days: 7, months: 0 }
  if (p === 'monthly') return { days: 0, months: 1 }
  if (p === 'yearly') return { days: 0, months: 12 }
  return { days: 0, months: 0 }
}
const eventRepeat = ref<EventRecur>(
  inferEventRecur(props.initial?.repeat_days ?? 0, props.initial?.repeat_months ?? 0)
)

function epochToDateStr(epoch: number): string {
  return new Date(epoch * 1000).toISOString().split('T')[0]
}
function dateStrToEpoch(s: string): number {
  return Math.floor(new Date(s + 'T00:00:00Z').getTime() / 1000)
}
const recurUntilStr = ref(
  props.initial?.recur_until != null ? epochToDateStr(props.initial.recur_until) : ''
)

const isEdit = computed(() => !!props.initial)

const formTitle = computed(() => {
  const action = isEdit.value ? 'Edit' : 'Add'
  if (type.value === 'bookmark') return `${action} Bookmark`
  if (type.value === 'note') return `${action} Note`
  if (type.value === 'event') return `${action} Event`
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

// Epoch helpers for the event start/end pair; using getTime/1000 picks up the
// browser's local TZ — matches what the user sees in the datetime-local input.
function strToEpoch(s: string): number | null {
  if (!s) return null
  const t = new Date(s).getTime()
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
}

const canSubmit = computed(() => {
  if (!title.value.trim()) return false
  if (type.value === 'bookmark' && !url.value.trim()) return false
  if (type.value === 'event') {
    if (!dueStr.value) return false
    // End must be after start when both are set. End is optional for legacy
    // point-in-time events; we only block invalid ranges.
    if (endStr.value) {
      const s = strToEpoch(dueStr.value)
      const e = strToEpoch(endStr.value)
      if (s == null || e == null || e <= s) return false
    }
  }
  return true
})

function submit() {
  if (!canSubmit.value) return

  const due_date = dueStr.value
    ? Math.floor(new Date(dueStr.value).getTime() / 1000)
    : null

  let rd = 0
  let rm = 0
  let recurUntil: number | null = null
  if (type.value === 'todo') {
    rd = repeatUnit.value === 'days' ? repeatValue.value : 0
    rm = repeatUnit.value === 'months' ? repeatValue.value : 0
  } else if (type.value === 'event') {
    const preset = presetToRepeat(eventRepeat.value)
    rd = preset.days
    rm = preset.months
    if (eventRepeat.value !== 'none' && recurUntilStr.value) {
      recurUntil = dateStrToEpoch(recurUntilStr.value)
    }
  }

  // Compute duration from end - start. Blank end on an event submits as null
  // (server treats null/0 as legacy point-in-time).
  let duration_seconds: number | null = null
  if (type.value === 'event' && due_date != null && endStr.value) {
    const endEpoch = strToEpoch(endStr.value)
    if (endEpoch != null && endEpoch > due_date) {
      duration_seconds = endEpoch - due_date
    }
  }

  emit('submit', {
    title: title.value.trim(),
    description: description.value.trim(),
    category: effectiveCategory.value,
    priority: priority.value,
    due_date: type.value === 'todo' || type.value === 'event' ? due_date : null,
    repeat_days: rd,
    repeat_months: rm,
    type: type.value,
    url: type.value === 'bookmark' ? url.value.trim() : null,
    recur_until: type.value === 'event' ? recurUntil : null,
    duration_seconds: type.value === 'event' ? duration_seconds : null,
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
    <div
      class="bg-surface border border-border-strong rounded-xl w-full dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5 max-h-screen overflow-y-auto"
      :class="type === 'note' ? 'max-w-5xl' : 'max-w-lg'"
    >
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
              :placeholder="type === 'bookmark' ? 'Bookmark title' : type === 'note' ? 'Note title' : type === 'event' ? 'What is happening?' : 'What needs to be done?'"
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
              :rows="type === 'note' ? 12 : 2"
              :placeholder="type === 'note' ? 'Note content…' : 'Optional details…'"
              class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
              :class="type === 'note' ? 'resize-y min-h-40' : 'resize-none'"
            />
          </div>

          <!-- Event-only: Start (required) and End. End is optional so legacy
               point-in-time events keep working; new events default to a
               +30 min end. -->
          <div v-if="type === 'event'" class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Start *</label>
              <input
                v-model="dueStr"
                type="datetime-local"
                required
                class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label class="block text-xs text-muted mb-1 uppercase tracking-wider">End</label>
              <input
                v-model="endStr"
                type="datetime-local"
                class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <p
            v-if="type === 'event' && endStr && dueStr && (strToEpoch(endStr) ?? 0) <= (strToEpoch(dueStr) ?? 0)"
            class="text-xs text-danger -mt-1"
          >
            End must be after start.
          </p>

          <!-- Event-only: Recurrence -->
          <div v-if="type === 'event'">
            <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Repeats</label>
            <select
              v-model="eventRepeat"
              class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
            >
              <option value="none">Does not repeat</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <p v-if="isEdit && eventRepeat !== 'none'" class="text-xs text-muted mt-1">
              Edits apply to the whole series.
            </p>
          </div>

          <div v-if="type === 'event' && eventRepeat !== 'none'">
            <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Ends on (optional)</label>
            <input
              v-model="recurUntilStr"
              type="date"
              class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <!-- Category (todos / bookmarks / notes only — events live outside lists) -->
          <div v-if="type !== 'event'">
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
              <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Due Date &amp; Time</label>
              <input
                v-model="dueStr"
                type="datetime-local"
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

          <div class="flex gap-3 items-center mt-6">
            <button
              v-if="isEdit && type === 'event'"
              type="button"
              class="px-3 py-2 rounded-lg text-danger hover:bg-danger-bg transition-colors text-sm"
              @click="emit('delete')"
            >
              Delete
            </button>
            <div class="flex-1" />
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
