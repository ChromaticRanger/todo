<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import SpotlightOverlay from './SpotlightOverlay.vue'
import TourPopover from './TourPopover.vue'
import { TOUR_STEPS, type TourStep } from '../lib/tourSteps'
import { useEscapeKey } from '../composables/useEscapeKey'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()

const steps = computed<TourStep[]>(() =>
  TOUR_STEPS.filter((s) => !s.requiresTier || s.requiresTier === authStore.tier)
)

const emit = defineEmits<{
  /** User skipped via the Skip button or Escape — should clear replay state. */
  skip: []
  /** User reached and clicked Done on the last step — should mark seen. */
  done: []
}>()

const stepIndex = ref(0)
const targetEl = ref<HTMLElement | null>(null)
const targetRect = ref<{ top: number; left: number; width: number; height: number } | null>(null)

const currentStep = computed<TourStep>(() => steps.value[stepIndex.value])
const isLast = computed(() => stepIndex.value === steps.value.length - 1)
const canPrev = computed(() => stepIndex.value > 0)

function resolveTarget(step: TourStep): HTMLElement | null {
  if (step.placement === 'center') return null
  if (step.target) {
    return document.querySelector(step.target) as HTMLElement | null
  }
  if (step.targetKind) {
    // First visible item of the requested kind. Fall back gracefully if none.
    const candidates = document.querySelectorAll<HTMLElement>(
      `[data-item-type="${step.targetKind}"]`
    )
    for (const el of candidates) {
      if (el.offsetParent !== null) return el
    }
    return candidates[0] ?? null
  }
  return null
}

function measureTarget() {
  if (!targetEl.value) {
    targetRect.value = null
    return
  }
  const r = targetEl.value.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) {
    targetRect.value = null
    return
  }
  targetRect.value = { top: r.top, left: r.left, width: r.width, height: r.height }
}

let resizeObserver: ResizeObserver | null = null

function attachToCurrentStep() {
  resizeObserver?.disconnect()
  resizeObserver = null
  const el = resolveTarget(currentStep.value)
  targetEl.value = el
  if (el) {
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    resizeObserver = new ResizeObserver(measureTarget)
    resizeObserver.observe(el)
  }
  // Defer one frame so any scrollIntoView / layout settles before we measure.
  requestAnimationFrame(measureTarget)
}

function next() {
  if (isLast.value) {
    emit('done')
    return
  }
  stepIndex.value += 1
}

function prev() {
  if (canPrev.value) stepIndex.value -= 1
}

function skip() {
  emit('skip')
}

function done() {
  emit('done')
}

watch(stepIndex, attachToCurrentStep)

onMounted(() => {
  attachToCurrentStep()
  window.addEventListener('resize', measureTarget)
  window.addEventListener('scroll', measureTarget, true)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', measureTarget)
  window.removeEventListener('scroll', measureTarget, true)
})

useEscapeKey(skip)
</script>

<template>
  <SpotlightOverlay :rect="targetRect" />
  <TourPopover
    :title="currentStep.title"
    :body="currentStep.body"
    :step-num="stepIndex + 1"
    :total="steps.length"
    :rect="targetRect"
    :placement="currentStep.placement"
    :can-prev="canPrev"
    :is-last="isLast"
    @prev="prev"
    @next="next"
    @skip="skip"
    @done="done"
  />
</template>
