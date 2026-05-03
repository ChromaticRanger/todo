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
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-surface border border-border-strong rounded-xl w-full max-w-md dark:shadow-none shadow-2xl dark:inset-ring dark:inset-ring-white/5">
      <div class="p-6">
        <h3 class="text-text font-semibold text-lg mb-1">
          {{ isSnoozed ? 'Reschedule reminder' : 'Remind me later' }}
        </h3>
        <p class="text-xs text-muted mb-5 truncate">{{ todo.title }}</p>

        <div
          v-if="isSnoozed"
          class="mb-4 flex items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2"
        >
          <span class="text-xs text-text">
            Snoozed until <span class="font-medium">{{ snoozedLabel }}</span>
          </span>
          <button
            type="button"
            class="text-xs text-accent hover:text-accent-hover font-medium transition-colors"
            @click="unsnooze"
          >
            Unsnooze
          </button>
        </div>

        <form @submit.prevent="submit" class="space-y-4">
          <div>
            <label class="block text-xs text-muted mb-1 uppercase tracking-wider">Reappear on</label>
            <input
              ref="snoozeInput"
              v-model="snoozeStr"
              type="date"
              :min="minDate"
              class="w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div v-if="hasDueDate" class="rounded-lg border border-border-strong bg-bg/50 p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-muted">
                Currently due: <span class="text-text">{{ dueDateLabel }}</span>
              </span>
              <button
                type="button"
                class="text-xs text-accent hover:text-accent-hover transition-colors"
                @click="matchSnooze"
              >
                Match snooze date
              </button>
            </div>
            <input
              v-model="dueStr"
              type="datetime-local"
              class="mt-2 w-full bg-bg border border-border-strong rounded-lg px-3 py-2 text-text text-sm focus:outline-none focus:border-accent"
              @input="onDueInput"
            />
          </div>

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
              {{ isSnoozed ? 'Reschedule' : 'Snooze' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
