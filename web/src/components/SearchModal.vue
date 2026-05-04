<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Todo } from '../types/todo'
import { Status } from '../types/todo'
import { useSearchStore } from '../stores/searchStore'

const emit = defineEmits<{
  select: [todo: Todo]
  close: []
}>()

const search = useSearchStore()

const input = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const selectedIndex = ref(0)

onMounted(async () => {
  await nextTick()
  input.value?.focus()
})

watch(
  () => search.results,
  () => { selectedIndex.value = 0 },
)

function onInput(e: Event) {
  const value = (e.target as HTMLInputElement).value
  search.setQuery(value)
}

function nowSecs() {
  return Math.floor(Date.now() / 1000)
}

function isSnoozed(t: Todo): boolean {
  return t.snoozed_until !== null && t.snoozed_until > nowSecs()
}

function isCompleted(t: Todo): boolean {
  return t.status === Status.COMPLETED
}

function typeLabel(t: Todo): string {
  if (t.type === 'bookmark') return 'Bookmark'
  if (t.type === 'note') return 'Note'
  return 'Todo'
}

function snippet(text: string | null, q: string, max = 120): string {
  if (!text) return ''
  if (!q) return text.length > max ? text.slice(0, max) + '…' : text
  const lower = text.toLowerCase()
  const idx = lower.indexOf(q.toLowerCase())
  if (idx < 0) return text.length > max ? text.slice(0, max) + '…' : text
  const radius = Math.floor((max - q.length) / 2)
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + q.length + radius)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return prefix + text.slice(start, end) + suffix
}

interface Segment { text: string; mark: boolean }

function highlight(text: string, q: string): Segment[] {
  if (!q || q.length < 1) return [{ text, mark: false }]
  const segs: Segment[] = []
  const needle = q.toLowerCase()
  const lower = text.toLowerCase()
  let i = 0
  while (i < text.length) {
    const found = lower.indexOf(needle, i)
    if (found < 0) {
      segs.push({ text: text.slice(i), mark: false })
      break
    }
    if (found > i) segs.push({ text: text.slice(i, found), mark: false })
    segs.push({ text: text.slice(found, found + needle.length), mark: true })
    i = found + needle.length
  }
  return segs
}

const trimmedQuery = computed(() => search.query.trim())

const showHint = computed(
  () => trimmedQuery.value.length < 2 && !search.loading,
)
const showEmpty = computed(
  () => trimmedQuery.value.length >= 2 && !search.loading && search.results.length === 0,
)

function close() {
  emit('close')
}

function select(t: Todo) {
  emit('select', t)
}

function scrollSelectedIntoView() {
  const list = listEl.value
  if (!list) return
  const el = list.querySelector<HTMLElement>(`[data-result-index="${selectedIndex.value}"]`)
  el?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    return
  }
  if (search.results.length === 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % search.results.length
    void nextTick(scrollSelectedIntoView)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value =
      (selectedIndex.value - 1 + search.results.length) % search.results.length
    void nextTick(scrollSelectedIntoView)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = search.results[selectedIndex.value]
    if (item) select(item)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="fixed inset-0 bg-black/60 flex items-start justify-center pt-[15vh] z-50"
    @click.self="close"
  >
    <div
      class="bg-surface border border-border-strong rounded-xl w-full max-w-2xl mx-4 shadow-2xl dark:shadow-none dark:inset-ring dark:inset-ring-white/5 flex flex-col max-h-[70vh]"
    >
      <!-- Search input -->
      <div class="flex items-center gap-3 px-4 py-3 border-b border-border">
        <svg class="size-5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
        <input
          ref="input"
          :value="search.query"
          type="text"
          placeholder="Search across all lists…"
          class="flex-1 bg-transparent text-text placeholder:text-muted text-base focus:outline-none"
          autocomplete="off"
          spellcheck="false"
          @input="onInput"
        />
        <span v-if="search.loading" class="size-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
        <button
          type="button"
          class="text-muted hover:text-text shrink-0"
          title="Close (Esc)"
          @click="close"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Results -->
      <div ref="listEl" class="flex-1 overflow-y-auto scrollbar-thin">
        <div v-if="showHint" class="px-4 py-8 text-sm text-muted text-center">
          Type at least 2 characters to search
        </div>
        <div v-else-if="showEmpty" class="px-4 py-8 text-sm text-muted text-center">
          No matches for "{{ trimmedQuery }}"
        </div>
        <div v-else-if="search.error" class="px-4 py-8 text-sm text-danger text-center">
          {{ search.error }}
        </div>
        <ul v-else class="py-1">
          <li
            v-for="(item, i) in search.results"
            :key="item.id"
            :data-result-index="i"
            class="px-4 py-2.5 cursor-pointer flex items-start gap-3 border-l-2 transition-colors"
            :class="i === selectedIndex
              ? 'bg-surface-hover border-accent'
              : 'border-transparent hover:bg-surface-hover/60'"
            @mouseenter="selectedIndex = i"
            @click="select(item)"
          >
            <!-- Type icon -->
            <span class="mt-0.5 shrink-0 size-5 flex items-center justify-center text-muted">
              <svg v-if="item.type === 'bookmark'" class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <svg v-else-if="item.type === 'note'" class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <svg v-else class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </span>

            <div class="flex-1 min-w-0">
              <div class="text-sm text-text truncate" :class="isCompleted(item) ? 'line-through text-muted' : ''">
                <template v-for="(seg, si) in highlight(item.title, trimmedQuery)" :key="si">
                  <mark v-if="seg.mark" class="bg-accent/25 text-text rounded-sm px-0.5">{{ seg.text }}</mark>
                  <template v-else>{{ seg.text }}</template>
                </template>
              </div>
              <div v-if="item.description" class="mt-0.5 text-xs text-muted truncate">
                <template v-for="(seg, si) in highlight(snippet(item.description, trimmedQuery), trimmedQuery)" :key="si">
                  <mark v-if="seg.mark" class="bg-accent/25 text-text rounded-sm px-0.5">{{ seg.text }}</mark>
                  <template v-else>{{ seg.text }}</template>
                </template>
              </div>
              <div class="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <span class="uppercase tracking-wider">{{ typeLabel(item) }}</span>
                <span>·</span>
                <span class="truncate">{{ item.list_name }}</span>
                <span>·</span>
                <span class="truncate">{{ item.category || 'General' }}</span>
                <span
                  v-if="isCompleted(item)"
                  class="ml-1 px-1.5 py-0.5 rounded-full bg-accent/15 text-accent text-[10px] font-medium"
                >
                  Completed
                </span>
                <span
                  v-else-if="isSnoozed(item)"
                  class="ml-1 px-1.5 py-0.5 rounded-full bg-warning-bg text-warning-fg text-[10px] font-medium"
                  title="Snoozed"
                >
                  Snoozed
                </span>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <!-- Footer -->
      <div
        v-if="search.truncated || search.results.length > 0"
        class="px-4 py-2 border-t border-border text-[11px] text-muted flex items-center justify-between"
      >
        <span v-if="search.truncated">Showing first {{ search.results.length }} results — refine your search.</span>
        <span v-else>{{ search.results.length }} result{{ search.results.length === 1 ? '' : 's' }}</span>
        <span class="hidden sm:inline">↑↓ navigate · ↵ open · Esc close</span>
      </div>
    </div>
  </div>
</template>
