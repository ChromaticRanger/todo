<script setup lang="ts">
import { computed } from 'vue'
import type { TourPlacement } from '../lib/tourSteps'
import { useSettingsStore } from '../stores/settingsStore'

const settingsStore = useSettingsStore()

const props = defineProps<{
  title: string
  body: string
  stepNum: number
  total: number
  /** Anchor rect in viewport coords; null = center on screen. */
  rect: { top: number; left: number; width: number; height: number } | null
  placement?: TourPlacement
  canPrev: boolean
  isLast: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
  skip: []
  done: []
}>()

const POPOVER_WIDTH = 340
const POPOVER_GAP = 16

/**
 * Place the popover next to the spotlit rect, choosing the side with the most
 * room. Falls back to centering when the rect is null or doesn't fit anywhere.
 */
const popoverStyle = computed(() => {
  if (!props.rect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${POPOVER_WIDTH}px`,
    }
  }
  const r = props.rect
  const vw = window.innerWidth
  const vh = window.innerHeight

  type Side = 'top' | 'right' | 'bottom' | 'left'
  const room: Record<Side, number> = {
    top: r.top,
    right: vw - (r.left + r.width),
    bottom: vh - (r.top + r.height),
    left: r.left,
  }

  const requested = (props.placement ?? 'auto') as Side | 'auto' | 'center'
  if (requested === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `${POPOVER_WIDTH}px`,
    }
  }

  const order: Side[] =
    requested === 'auto'
      ? (['bottom', 'right', 'top', 'left'] as Side[]).sort(
          (a, b) => room[b] - room[a]
        )
      : ([requested, 'bottom', 'right', 'top', 'left'] as Side[]).filter(
          (v, i, arr) => arr.indexOf(v) === i
        )

  const side = order.find((s) => room[s] >= 200) ?? order[0]

  let top: number
  let left: number
  switch (side) {
    case 'bottom':
      top = r.top + r.height + POPOVER_GAP
      left = clamp(r.left + r.width / 2 - POPOVER_WIDTH / 2, 8, vw - POPOVER_WIDTH - 8)
      break
    case 'top':
      top = Math.max(8, r.top - POPOVER_GAP - 200)
      left = clamp(r.left + r.width / 2 - POPOVER_WIDTH / 2, 8, vw - POPOVER_WIDTH - 8)
      break
    case 'right':
      top = clamp(r.top + r.height / 2 - 100, 8, vh - 220)
      left = Math.min(vw - POPOVER_WIDTH - 8, r.left + r.width + POPOVER_GAP)
      break
    case 'left':
      top = clamp(r.top + r.height / 2 - 100, 8, vh - 220)
      left = Math.max(8, r.left - POPOVER_GAP - POPOVER_WIDTH)
      break
  }
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${POPOVER_WIDTH}px`,
  }
})

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
</script>

<template>
  <div
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    :data-theme="settingsStore.theme"
    data-mode="light"
    class="fixed z-50 bg-surface text-text border border-border-strong rounded-xl shadow-2xl p-5"
    :style="popoverStyle"
  >
    <div class="flex items-center justify-between mb-2">
      <span class="text-[11px] font-semibold tracking-wider uppercase text-muted">
        Step {{ stepNum }} of {{ total }}
      </span>
      <button
        type="button"
        class="text-muted hover:text-text text-xs"
        @click="emit('skip')"
      >
        Skip tour
      </button>
    </div>

    <h2 class="text-lg font-semibold text-text mb-1.5">{{ title }}</h2>
    <p class="text-sm text-muted leading-relaxed">{{ body }}</p>

    <div class="mt-4 flex items-center justify-between gap-2">
      <button
        type="button"
        class="px-3 py-1.5 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted"
        :disabled="!canPrev"
        @click="emit('prev')"
      >
        Previous
      </button>
      <button
        v-if="!isLast"
        type="button"
        class="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors"
        @click="emit('next')"
      >
        Next
      </button>
      <button
        v-else
        type="button"
        class="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors"
        @click="emit('done')"
      >
        Done
      </button>
    </div>
  </div>
</template>
