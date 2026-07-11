<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Todo, TodoFormData, ItemType } from '../types/todo'
import { Priority } from '../types/todo'
import { useEscapeKey } from '../composables/useEscapeKey'
import { EVENT_COLORS, swatchColor } from '../lib/eventColor'
import ToggleSwitch from './ToggleSwitch.vue'

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
// Per-item calendar colour (events + todos). null = default / theme accent.
const color = ref<string | null>(props.initial?.color ?? null)
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

// ── All-day events ──────────────────────────────────────────────────────────
// An all-day event stores its start at local midnight and a duration that is a
// whole number of days. The form edits it via two date-only inputs (start +
// inclusive end day) instead of the datetime pair.
function epochToDateInput(epoch: number): string {
  const d = new Date(epoch * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function dateInputToLocalMidnight(s: string): number | null {
  if (!s) return null
  const t = new Date(s + 'T00:00:00').getTime()
  return Number.isFinite(t) ? Math.floor(t / 1000) : null
}
const allDay = ref(props.initial?.all_day ?? false)
const startDateStr = ref(
  props.initial?.due_date != null
    ? epochToDateInput(props.initial.due_date)
    : props.initialDue != null
      ? epochToDateInput(props.initialDue)
      : ''
)
// End is the last *inclusive* day. A 1-day event ends on its start day.
const endDateStr = ref((() => {
  if (props.initial?.all_day && props.initial.due_date != null) {
    const days = Math.max(1, Math.round((props.initial.duration_seconds ?? 86400) / 86400))
    return epochToDateInput(props.initial.due_date + (days - 1) * 86400)
  }
  return startDateStr.value
})())
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

// Snooze: a todo can be "Remind me later"-snoozed, which hides it from the list
// until its reappear date. The edit form surfaces an on/off toggle for an active
// snooze so it can be cleared here (there's no other reachable unsnooze once the
// row is hidden from the list). Turning it off sends snoozed_until: null on save;
// leaving it on omits the field so the snooze is untouched.
const initialSnoozeUntil = computed(() =>
  props.initial?.type === 'todo' ? props.initial.snoozed_until ?? null : null
)
const isSnoozed = computed(() =>
  initialSnoozeUntil.value != null && initialSnoozeUntil.value * 1000 > Date.now()
)
const snoozeOn = ref(true)
const snoozeUntilLabel = computed(() =>
  initialSnoozeUntil.value != null
    ? new Date(initialSnoozeUntil.value * 1000).toLocaleString()
    : ''
)

const formTitle = computed(() => {
  const action = isEdit.value ? 'Edit' : 'Add'
  if (type.value === 'bookmark') return `${action} Bookmark`
  if (type.value === 'note') return `${action} Note`
  if (type.value === 'event') return `${action} Event`
  return `${action} Todo`
})

// Leading header icon per type (Heroicons outline paths) — reinforces context
// at a glance and gives each form a touch of the theme's accent colour.
const iconPath = computed(() => {
  if (type.value === 'bookmark')
    return 'M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z'
  if (type.value === 'note')
    return 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z'
  if (type.value === 'event')
    return 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5'
  return 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
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
    if (allDay.value) {
      if (!startDateStr.value) return false
      const s = dateInputToLocalMidnight(startDateStr.value)
      const e = dateInputToLocalMidnight(endDateStr.value || startDateStr.value)
      if (s == null || e == null || e < s) return false
    } else {
      if (!dueStr.value) return false
      // End must be after start when both are set. End is optional for legacy
      // point-in-time events; we only block invalid ranges.
      if (endStr.value) {
        const s = strToEpoch(dueStr.value)
        const e = strToEpoch(endStr.value)
        if (s == null || e == null || e <= s) return false
      }
    }
  }
  return true
})

function submit() {
  if (!canSubmit.value) return

  // All-day events derive start/duration from whole days; everything else uses
  // the datetime-local start (and, for events, the optional end).
  const isAllDayEvent = type.value === 'event' && allDay.value
  const due_date = isAllDayEvent
    ? dateInputToLocalMidnight(startDateStr.value)
    : dueStr.value
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

  // Compute duration. All-day: span from start day through the inclusive end
  // day (so a single day = 86400). Timed: end - start, blank end → null
  // (server treats null/0 as legacy point-in-time).
  let duration_seconds: number | null = null
  if (isAllDayEvent && due_date != null) {
    const endEpoch = dateInputToLocalMidnight(endDateStr.value || startDateStr.value)
    if (endEpoch != null && endEpoch >= due_date) {
      duration_seconds = (endEpoch - due_date) + 86400
    }
  } else if (type.value === 'event' && due_date != null && endStr.value) {
    const endEpoch = strToEpoch(endStr.value)
    if (endEpoch != null && endEpoch > due_date) {
      duration_seconds = endEpoch - due_date
    }
  }

  const payload: TodoFormData = {
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
    color: type.value === 'event' || type.value === 'todo' ? color.value : null,
    all_day: type.value === 'event' ? allDay.value : false,
  }

  // Only carry snoozed_until when clearing an active snooze; omit otherwise so
  // the save leaves the field alone.
  if (isSnoozed.value && !snoozeOn.value) payload.snoozed_until = null

  emit('submit', payload)
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
  <div class="modal-backdrop">
    <div
      class="modal-card flex max-h-[88vh] flex-col"
      :class="type === 'note' ? 'max-w-5xl' : 'max-w-lg'"
    >
      <form @submit.prevent="submit" class="flex min-h-0 flex-col">
        <!-- Header: type icon + title + close -->
        <div class="modal-header">
          <span class="modal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5" aria-hidden="true">
              <path :d="iconPath" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <h3 class="flex-1 text-base font-semibold text-text">
            {{ formTitle }}
          </h3>
          <button type="button" class="btn-icon" aria-label="Close" @click="emit('cancel')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5" aria-hidden="true">
              <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto scrollbar-thin p-5">

          <!-- Bookmark: URL first -->
          <div v-if="type === 'bookmark'">
            <label class="field-label">URL *</label>
            <input
              v-model="url"
              type="url"
              name="url"
              placeholder="https://example.com"
              class="field-input"
              ref="urlInput"
            />
          </div>

          <!-- Title (all types) -->
          <div>
            <label class="field-label">Title *</label>
            <input
              v-model="title"
              type="text"
              name="title"
              :placeholder="type === 'bookmark' ? 'Bookmark title' : type === 'note' ? 'Note title' : type === 'event' ? 'What is happening?' : 'What needs to be done?'"
              class="field-input"
              ref="titleInput"
            />
          </div>

          <!-- Description / Body -->
          <div>
            <label class="field-label">
              {{ type === 'note' ? 'Body' : 'Description' }}
            </label>
            <textarea
              v-model="description"
              name="description"
              :rows="type === 'note' ? 12 : 2"
              :placeholder="type === 'note' ? 'Note content…' : 'Optional details…'"
              class="field-input"
              :class="type === 'note' ? 'resize-y min-h-40' : 'resize-none'"
            />
          </div>

          <!-- Event-only: All-day toggle + date/time range. -->
          <div v-if="type === 'event'" class="flex items-center justify-between">
            <label class="field-label mb-0">All day</label>
            <ToggleSwitch v-model="allDay" label="All day" />
          </div>

          <!-- Timed event: Start (required) and End. End is optional so legacy
               point-in-time events keep working; new events default to a
               +30 min end. -->
          <div v-if="type === 'event' && !allDay" class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label">Start *</label>
              <input
                v-model="dueStr"
                type="datetime-local"
                name="start"
                required
                class="field-input"
              />
            </div>
            <div>
              <label class="field-label">End</label>
              <input
                v-model="endStr"
                type="datetime-local"
                name="end"
                class="field-input"
              />
            </div>
          </div>
          <p
            v-if="type === 'event' && !allDay && endStr && dueStr && (strToEpoch(endStr) ?? 0) <= (strToEpoch(dueStr) ?? 0)"
            class="-mt-1 text-xs text-danger"
          >
            End must be after start.
          </p>

          <!-- All-day event: date-only start + inclusive end day. -->
          <div v-if="type === 'event' && allDay" class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label">Start *</label>
              <input
                v-model="startDateStr"
                type="date"
                name="start-date"
                required
                class="field-input"
              />
            </div>
            <div>
              <label class="field-label">End</label>
              <input
                v-model="endDateStr"
                type="date"
                name="end-date"
                :min="startDateStr"
                class="field-input"
              />
            </div>
          </div>

          <!-- Event-only: Recurrence -->
          <div v-if="type === 'event'">
            <label class="field-label">Repeats</label>
            <select v-model="eventRepeat" name="repeats" class="field-select">
              <option value="none">Does not repeat</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
            <p v-if="isEdit && eventRepeat !== 'none'" class="mt-1 text-xs text-muted">
              Edits apply to the whole series.
            </p>
          </div>

          <div v-if="type === 'event' && eventRepeat !== 'none'">
            <label class="field-label">Ends on (optional)</label>
            <input
              v-model="recurUntilStr"
              type="date"
              name="recur-until"
              class="field-input"
            />
          </div>

          <!-- Colour (events + todos) — how the item is tinted on the calendar. -->
          <div v-if="type === 'event' || type === 'todo'">
            <label class="field-label">Colour</label>
            <div class="flex flex-wrap items-center gap-2">
              <!-- "Default" = no custom colour (item uses the theme accent). Shown
                   as a neutral slashed swatch so it never looks like the accent-
                   coloured palette entry (which would duplicate it per theme). -->
              <button
                type="button"
                class="size-7 rounded-full border-2 transition-transform hover:scale-110"
                :class="color === null ? 'border-accent ring-2 ring-accent/40' : 'border-border'"
                :style="{
                  backgroundColor: 'var(--color-surface-hover)',
                  backgroundImage: 'linear-gradient(135deg, transparent 44%, var(--color-muted) 44%, var(--color-muted) 56%, transparent 56%)',
                }"
                title="Default (theme colour)"
                aria-label="Default colour"
                @click="color = null"
              />
              <button
                v-for="c in EVENT_COLORS"
                :key="c"
                type="button"
                class="size-7 rounded-full border-2 transition-transform hover:scale-110"
                :class="color === c ? 'border-text ring-2 ring-accent/40' : 'border-transparent'"
                :style="{ background: swatchColor(c) }"
                :title="c"
                :aria-label="c"
                @click="color = c"
              />
            </div>
          </div>

          <!-- Category (todos / bookmarks / notes only — events live outside lists) -->
          <div v-if="type !== 'event'">
            <label class="field-label">Category</label>
            <select v-model="selectedCategory" name="category" class="field-select">
              <option v-for="c in knownCategories" :key="c" :value="c">{{ c }}</option>
              <option value="__other__">Other…</option>
            </select>
            <input
              v-if="selectedCategory === '__other__'"
              v-model="customCategory"
              type="text"
              name="custom-category"
              placeholder="Category name"
              class="field-input mt-2"
            />
          </div>

          <!-- Todo-only fields: Priority, Due date, Repeat -->
          <template v-if="type === 'todo'">
            <div>
              <label class="field-label">Priority</label>
              <select v-model="priority" name="priority" class="field-select">
                <option v-for="p in priorityLabels" :key="p.value" :value="p.value">
                  {{ p.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="field-label">Due Date &amp; Time</label>
              <input
                v-model="dueStr"
                type="datetime-local"
                name="due"
                class="field-input"
              />
            </div>

            <div>
              <label class="field-label">Repeat</label>
              <div class="flex gap-2">
                <input
                  v-model.number="repeatValue"
                  type="number"
                  name="repeat-value"
                  min="0"
                  placeholder="0"
                  class="field-input w-20"
                />
                <select v-model="repeatUnit" name="repeat-unit" class="field-select flex-1">
                  <option value="days">Days</option>
                  <option value="months">Months</option>
                </select>
              </div>
              <p v-if="repeatValue > 0" class="mt-1 text-xs text-accent">
                Repeats every {{ repeatValue }} {{ repeatUnit }}
              </p>
            </div>

            <!-- Snooze: shown only for a todo that's currently snoozed. Turning
                 it off clears the snooze on save so the item returns to the list. -->
            <div v-if="isSnoozed" class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <label class="field-label mb-0">Snoozed</label>
                <p class="mt-0.5 text-xs text-muted">
                  Hidden from the list until {{ snoozeUntilLabel }}. Turn off to unsnooze.
                </p>
              </div>
              <ToggleSwitch v-model="snoozeOn" label="Snoozed" />
            </div>
          </template>
        </div>

        <!-- Footer actions -->
        <div class="modal-footer">
          <button
            v-if="isEdit && type === 'event'"
            type="button"
            class="btn-danger-ghost"
            @click="emit('delete')"
          >
            Delete
          </button>
          <div class="flex-1" />
          <button type="button" class="btn-ghost" @click="emit('cancel')">
            Cancel
          </button>
          <button type="submit" :disabled="!canSubmit" class="btn-primary">
            {{ isEdit ? 'Save' : 'Add' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
