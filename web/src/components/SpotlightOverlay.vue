<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** Target rectangle in viewport coordinates, or null for a flat overlay. */
  rect: { top: number; left: number; width: number; height: number } | null
  /** Padding around the spotlight cutout, in px. */
  padding?: number
  /** Border radius of the spotlight cutout, in px. */
  radius?: number
}>()

const padding = computed(() => props.padding ?? 6)
const radius = computed(() => props.radius ?? 10)

const cutoutStyle = computed(() => {
  if (!props.rect) return null
  const r = props.rect
  const p = padding.value
  return {
    top: `${r.top - p}px`,
    left: `${r.left - p}px`,
    width: `${r.width + p * 2}px`,
    height: `${r.height + p * 2}px`,
    borderRadius: `${radius.value}px`,
  }
})
</script>

<template>
  <!-- Flat overlay when there's no target (centered popover steps). -->
  <div
    v-if="!cutoutStyle"
    class="fixed inset-0 z-40 bg-black/60"
    aria-hidden="true"
  />
  <!-- Cutout: a transparent box with a huge box-shadow that paints the
       outside-the-box region semi-opaque black. Pointer-events stay on so the
       overlay still swallows clicks on the dimmed area; the cutout itself is
       transparent to clicks if the target needs to remain interactive (it
       doesn't here, but the visual is the point). -->
  <div
    v-else
    class="fixed z-40 pointer-events-none"
    :style="cutoutStyle"
    aria-hidden="true"
  >
    <div
      class="absolute inset-0"
      style="box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6); border-radius: inherit;"
    />
    <div
      class="absolute inset-0 ring-2 ring-accent/80"
      style="border-radius: inherit;"
    />
  </div>
</template>
