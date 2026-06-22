<script setup lang="ts">
import { computed } from 'vue'
import { useEscapeKey } from '../composables/useEscapeKey'
import type { Todo } from '../types/todo'

const props = defineProps<{ items: Todo[] }>()
const emit = defineEmits<{ close: [] }>()

useEscapeKey(() => emit('close'))

// Server already sorts by due_date; guard locally in case the order is ever lost.
const sorted = computed(() =>
  [...props.items].sort((a, b) => (a.due_date ?? 0) - (b.due_date ?? 0))
)

// Start of today (local), to tell carried-over overdue items apart from today's.
const startOfToday = (() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
})()

function isOverdue(t: Todo): boolean {
  return t.type !== 'event' && t.due_date != null && t.due_date < startOfToday
}

const hasOverdue = computed(() => sorted.value.some(isOverdue))

// Honor the stored due time — show whatever's on the row, no midnight heuristic.
// Items due today show the time; carried-over overdue items show their date.
function formatDue(t: Todo): string {
  if (t.due_date == null) return ''
  const d = new Date(t.due_date * 1000)
  if (isOverdue(t)) {
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// Events live in the sentinel '__events__' list — don't surface that name.
function listLabel(t: Todo): string | null {
  if (t.type === 'event' || t.list_name === '__events__') return null
  return t.list_name
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('close')">
    <div class="modal-card max-w-md">
      <div class="modal-header">
        <span class="modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" class="size-5" aria-hidden="true">
            <path
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0V11.25A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <div class="min-w-0 flex-1">
          <h3 class="text-base font-semibold text-text">Due today</h3>
          <p class="text-sm text-muted">
            {{ sorted.length
              ? `${sorted.length} ${sorted.length === 1 ? 'item' : 'items'} ${hasOverdue ? 'need your attention.' : 'due today.'}`
              : 'Nothing on your plate.' }}
          </p>
        </div>
        <button class="btn-icon" aria-label="Close" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="size-5" aria-hidden="true">
            <path d="M6 18 18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div v-if="sorted.length" class="max-h-[60vh] overflow-y-auto px-5 py-3">
        <ul class="flex flex-col divide-y divide-border/60">
          <li
            v-for="item in sorted"
            :key="`${item.type}-${item.id}-${item.due_date}`"
            class="flex items-center gap-3 py-2.5"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :class="{
                'bg-danger': item.priority === 3,
                'bg-accent': item.priority === 2,
                'bg-muted/50': item.priority === 1,
              }"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-text">{{ item.title }}</p>
              <p class="truncate text-xs text-muted">
                <span
                  v-if="isOverdue(item)"
                  class="mr-1.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-danger/15 text-danger"
                >Overdue</span>
                <span v-if="item.type === 'event'">Event</span>
                <span v-else-if="listLabel(item)">{{ listLabel(item) }}</span>
              </p>
            </div>
            <span
              class="shrink-0 text-xs tabular-nums"
              :class="isOverdue(item) ? 'text-danger' : 'text-muted'"
            >{{ formatDue(item) }}</span>
          </li>
        </ul>
      </div>

      <div v-else class="px-5 py-8 text-center">
        <p class="text-2xl">🎉</p>
        <p class="mt-2 text-sm font-medium text-text">You're all clear today</p>
        <p class="mt-1 text-sm text-muted">Nothing is due. Enjoy your day.</p>
      </div>

      <div class="modal-footer justify-end">
        <button class="btn-primary" @click="emit('close')">Got it</button>
      </div>
    </div>
  </div>
</template>
