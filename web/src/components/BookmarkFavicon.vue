<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  url: string | null
  title?: string
  size?: 'xs' | 'md' | 'lg'
}>(), {
  title: '',
  size: 'md',
})

const URL_RE = /https?:\/\/[^\s]+/g

const faviconHost = computed(() => {
  const raw = props.url
  if (!raw) return null
  // url may already be a clean URL (bookmark) or a string with embedded URL (todo title).
  try {
    return new URL(raw).hostname
  } catch {}
  const match = URL_RE.exec(raw)
  URL_RE.lastIndex = 0
  if (!match) return null
  try {
    return new URL(match[0]).hostname
  } catch {
    return null
  }
})

const faviconDomain = computed(() =>
  faviconHost.value ? faviconHost.value.replace(/^www\./, '') : null,
)

// Google S2 first because it parses the site's HTML <link rel="icon" sizes="...">
// declarations and serves the highest-resolution icon the site advertises —
// best-quality option for popular sites whose root /apple-touch-icon.png or
// /favicon.ico are smaller than what's referenced in the HTML head (e.g.
// YouTube). Falls through to apple-touch-icon and /favicon.ico for sites
// Google hasn't indexed (small-image detected via @load dimensions below).
// DuckDuckGo last as the disambiguator: it 404s (not a placeholder) on miss,
// so it tells us "real favicon exists, keep the chain alive" vs "truly nothing,
// fall to tile letter" — needed because S2's 16px grey-globe is indistinguishable
// from a legitimate 16px favicon by image dimensions alone.
const faviconSources = computed(() => {
  const host = faviconHost.value
  if (!host) return []
  return [
    `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
    `https://${host}/apple-touch-icon.png`,
    `https://${host}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${host}.ico`,
  ]
})

const faviconSrcIndex = ref(0)
const faviconUrl = computed(() => faviconSources.value[faviconSrcIndex.value] ?? null)

const tileLetter = computed(() =>
  faviconDomain.value ? faviconDomain.value[0]!.toUpperCase() : '',
)

// Stable per-hostname hue so each site gets a recognizable colored tile.
const tileColor = computed(() => {
  const d = faviconDomain.value
  if (!d) return ''
  let h = 0
  for (let i = 0; i < d.length; i++) h = (h * 31 + d.charCodeAt(i)) >>> 0
  const hue = (h % 12) * 30
  return `oklch(0.58 0.18 ${hue})`
})

const faviconFailed = ref(false)
watch(faviconHost, () => {
  faviconSrcIndex.value = 0
  faviconFailed.value = false
})

function onFaviconError() {
  if (faviconSrcIndex.value < faviconSources.value.length - 1) {
    faviconSrcIndex.value++
  } else {
    faviconFailed.value = true
  }
}

// Google's S2 favicons service returns a fixed small grey globe on miss
// regardless of the requested sz=. A normally-sized icon arriving here
// means a real favicon; a tiny one means we should fall through.
function onFaviconLoad(e: Event) {
  const src = faviconSources.value[faviconSrcIndex.value]
  if (!src || !src.startsWith('https://www.google.com/s2/favicons')) return
  const img = e.target as HTMLImageElement
  if (!img.naturalWidth || img.naturalWidth > 16) return
  if (faviconSrcIndex.value < faviconSources.value.length - 1) {
    faviconSrcIndex.value++
  } else {
    faviconFailed.value = true
  }
}

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'xs':
      return {
        outer: 'size-5 rounded-full',
        img: 'size-3.5',
        tileText: 'text-[10px]',
        svg: 'size-3.5',
      }
    case 'lg':
      return {
        outer: 'size-12 rounded-lg',
        img: 'size-10',
        tileText: 'text-2xl',
        svg: 'size-9',
      }
    default:
      return {
        outer: 'size-9 rounded-lg',
        img: 'size-7',
        tileText: 'text-base',
        svg: 'size-7',
      }
  }
})
</script>

<template>
  <template v-if="faviconUrl">
    <span
      v-if="!faviconFailed"
      class="inline-flex items-center justify-center bg-white/90 flex-shrink-0"
      :class="sizeClasses.outer"
    >
      <img
        :src="faviconUrl"
        :class="sizeClasses.img"
        :alt="title"
        @error="onFaviconError"
        @load="onFaviconLoad"
      />
    </span>
    <span
      v-else
      class="inline-flex items-center justify-center text-white font-semibold leading-none select-none flex-shrink-0"
      :class="[sizeClasses.outer, sizeClasses.tileText]"
      :style="{ background: tileColor }"
      :aria-label="faviconDomain ?? title"
    >{{ tileLetter }}</span>
  </template>
  <span
    v-else
    class="inline-flex items-center justify-center text-muted flex-shrink-0"
    :class="sizeClasses.outer"
  >
    <svg :class="sizeClasses.svg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  </span>
</template>
