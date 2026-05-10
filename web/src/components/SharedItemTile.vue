<script setup lang="ts">
import BookmarkFavicon from './BookmarkFavicon.vue'
import type { SharedItem } from '../stores/discoverStore'

defineProps<{ item: SharedItem }>()

function describeRecurrence(days: number, months: number): string {
  if (days === 1) return 'Daily'
  if (days === 7) return 'Weekly'
  if (days === 14) return 'Fortnightly'
  if (days > 0) return `Every ${days} days`
  if (months === 1) return 'Monthly'
  if (months === 12) return 'Yearly'
  if (months > 0) return `Every ${months} months`
  return ''
}
</script>

<template>
  <a
    v-if="item.type === 'bookmark' && item.url"
    :href="item.url"
    target="_blank"
    rel="noopener noreferrer"
    :title="item.title"
    class="flex flex-col items-center w-16 rounded-lg p-1 hover:bg-surface-hover transition-colors"
  >
    <BookmarkFavicon :url="item.url" :title="item.title" size="lg" />
    <span class="mt-1 w-full text-center text-[11px] leading-tight text-text truncate">
      {{ item.title }}
    </span>
  </a>

  <div
    v-else-if="item.type === 'todo'"
    class="flex items-start gap-2 rounded-lg bg-surface-hover/30 border border-border-strong/30 p-2"
  >
    <span class="size-4 rounded-full border-2 border-muted/50 shrink-0 mt-0.5" />
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text truncate">{{ item.title }}</p>
      <p v-if="item.description" class="text-xs text-muted mt-0.5">{{ item.description }}</p>
      <p
        v-if="item.repeat_days > 0 || item.repeat_months > 0"
        class="text-[11px] text-accent mt-0.5"
      >
        {{ describeRecurrence(item.repeat_days, item.repeat_months) }}
      </p>
    </div>
  </div>

  <div
    v-else-if="item.type === 'note'"
    class="rounded-lg bg-amber-50/60 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/30 p-2"
  >
    <p class="text-sm font-medium text-text">{{ item.title }}</p>
    <p v-if="item.description" class="text-xs text-muted mt-1 whitespace-pre-line">
      {{ item.description }}
    </p>
  </div>

  <div
    v-else
    class="flex items-start gap-2 rounded-lg bg-surface-hover/30 border border-border-strong/30 p-2"
  >
    <span class="text-[10px] uppercase tracking-wider text-muted shrink-0 mt-1">
      {{ item.type }}
    </span>
    <div class="flex-1 min-w-0">
      <p class="text-sm text-text">{{ item.title }}</p>
      <p v-if="item.description" class="text-xs text-muted mt-0.5">{{ item.description }}</p>
    </div>
  </div>
</template>
