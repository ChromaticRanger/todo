<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Todo } from '../types/todo'
import { useEscapeKey } from '../composables/useEscapeKey'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{
  submit: [payload: { snoozed_until: number | null; due_date?: number | null }]
  cancel: []
}>()

function epochToDateStr(epoch: number): string {
  return new Date(epoch * 1000).toISOString().split('T')[0]
}

function dateStrToEpoch(s: string): number {
  return Math.floor(new Date(s + 'T00:00:00Z').getTime() / 1000)
}

function epochToDatetimeLocalStr(epoch: number): string {
  const d = new Date(epoch * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datetimeLocalStrToEpoch(s: string): number {
  return Math.floor(new Date(s).getTime() / 1000)
}

function formatDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const tomorrow = new Date()
tomorrow.setDate(tomorrow.getDate() + 1)
const minDate = epochToDateStr(Math.floor(tomorrow.getTime() / 1000))

const isSnoozed = computed(() => props.todo.snoozed_until != null)
const snoozedLabel = computed(() =>
  props.todo.snoozed_until ? formatDate(props.todo.snoozed_until) : ''
)

const snoozeStr = ref(
  props.todo.snoozed_until ? epochToDateStr(props.todo.snoozed_until) : minDate
)

const hasDueDate = computed(() => props.todo.due_date != null)
const dueStr = ref(props.todo.due_date ? epochToDatetimeLocalStr(props.todo.due_date) : '')
const dueDirty = ref(false)

const dueDateLabel = computed(() =>
  props.todo.due_date ? formatDate(props.todo.due_date) : ''
)

const canSubmit = computed(() => !!snoozeStr.value && snoozeStr.value >= minDate)

function matchSnooze() {
  // snoozeStr is a date-only "YYYY-MM-DD"; the due input is datetime-local,
  // so keep any existing time-of-day, otherwise default to 09:00.
  const time = dueStr.value.includes('T') ? dueStr.value.slice(11, 16) : '09:00'
  dueStr.value = `${snoozeStr.value}T${time}`
  dueDirty.value = true
}

function onDueInput() {
  dueDirty.value = true
}

function submit() {
  if (!canSubmit.value) return
  const payload: { snoozed_until: number | null; due_date?: number | null } = {
    snoozed_until: dateStrToEpoch(snoozeStr.value),
  }
  if (dueDirty.value) {
    payload.due_date = dueStr.value ? datetimeLocalStrToEpoch(dueStr.value) : null
  }
  emit('submit', payload)
}

function unsnooze() {
  emit('submit', { snoozed_until: null })
}

const snoozeInput = ref<HTMLInputElement | null>(null)
onMounted(() => snoozeInput.value?.focus())
useEscapeKey(() => emit('cancel'))
</script>

<template>
  <div class="modal-backdrop">
    <div class="modal-card max-w-md">
      <form @submit.prevent="submit">
        <div class="modal-header">
          <span class="modal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5" aria-hidden="true">
              <path
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <h3 class="text-base font-semibold text-text">
              {{ isSnoozed ? 'Reschedule reminder' : 'Remind me later' }}
            </h3>
            <p class="truncate text-xs text-muted">{{ todo.title }}</p>
          </div>
        </div>

        <div class="space-y-4 p-5">
          <div
            v-if="isSnoozed"
            class="flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2"
          >
            <span class="text-xs text-text">
              Snoozed until <span class="font-medium">{{ snoozedLabel }}</span>
            </span>
            <button
              type="button"
              class="text-xs font-medium text-accent transition-colors hover:text-accent-hover"
              @click="unsnooze"
            >
              Unsnooze
            </button>
          </div>

          <div>
            <label class="field-label">Reappear on</label>
            <input
              ref="snoozeInput"
              v-model="snoozeStr"
              type="date"
              name="snooze"
              :min="minDate"
              class="field-input"
            />
          </div>

          <div v-if="hasDueDate" class="rounded-lg border border-border-strong bg-bg/50 p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-muted">
                Currently due: <span class="text-text">{{ dueDateLabel }}</span>
              </span>
              <button
                type="button"
                class="text-xs text-accent transition-colors hover:text-accent-hover"
                @click="matchSnooze"
              >
                Match snooze date
              </button>
            </div>
            <input
              v-model="dueStr"
              type="datetime-local"
              name="due"
              class="field-input mt-2"
              @input="onDueInput"
            />
          </div>
        </div>

        <div class="modal-footer justify-end">
          <button type="button" class="btn-ghost" @click="emit('cancel')">
            Cancel
          </button>
          <button type="submit" :disabled="!canSubmit" class="btn-primary">
            {{ isSnoozed ? 'Reschedule' : 'Snooze' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
