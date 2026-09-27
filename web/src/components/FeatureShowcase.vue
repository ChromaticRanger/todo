<script setup lang="ts">
/**
 * The landing page's feature carousel.
 *
 * A flex track of full-width slides moved with translateX — no library, no
 * scroll-snap. Tabs are the primary affordance (ARIA tabs, automatic
 * activation); the dots and hover arrows are decorative duplicates of them and
 * are hidden from assistive tech, because two focusable control sets for one
 * group of panels is an annoyance to navigate.
 *
 * Media lives in public/showcase/ as 16:10 WebP at 1200w and 2000w, derived
 * from the PNGs in public/help-images/ and public/blog-images/. Regenerate with
 * `npm run showcase:images` — re-running `npm run help:shots` does NOT update
 * these derivatives.
 *
 * Adding a video clip later is a data-only change: drop webm+mp4 in
 * public/showcase/, add `sources` to the slide, keep `still` as the poster.
 * Only the active slide mounts its <video>, so the page never holds more than
 * one decoding clip however many slides there are.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

interface ShowcaseSlide {
  /** Stable key, and the id stem wiring each tab to its panel. */
  id: string
  /** Tab label. One or two words — the pill row wraps on mobile. */
  label: string
  /** Visible line under the media. */
  caption: string
  /** Describes what the image shows. Never duplicates the caption. */
  alt: string
  /** The still. For a video slide this becomes the poster. */
  still: string
  stillSrcset: string
  width: number
  height: number
  /** Presence of this makes it a video slide. */
  sources?: { src: string; type: string }[]
}

const slides: ShowcaseSlide[] = [
  {
    id: 'one-list',
    label: 'One list',
    caption: 'Todos, bookmarks and notes side by side, grouped into categories you choose.',
    alt: 'A travel list holding four places saved as bookmarks next to a dated todo and a packing-list note.',
    still: '/showcase/one-list-1200.webp',
    stillSrcset: '/showcase/one-list-1200.webp 1200w, /showcase/one-list-2000.webp 2000w',
    width: 1200,
    height: 750,
  },
  {
    id: 'kanban',
    label: 'Kanban',
    caption: 'Flip any list to a board when you’d rather drag than scroll.',
    alt: 'A side-project list shown as kanban columns — Design, Build, Content and Launch side by side, each holding a mix of tasks, links and notes.',
    still: '/showcase/kanban-1200.webp',
    stillSrcset: '/showcase/kanban-1200.webp 1200w, /showcase/kanban-2000.webp 2000w',
    width: 1200,
    height: 750,
  },
  {
    id: 'bookmarks',
    label: 'Bookmarks',
    caption: 'Use as your bookmark launcher — the sites you open every day, grouped and one click away.',
    alt: 'A Bookmarks list tiled into a grid: Daily, Dev, News, Watch & listen, Social and AI, each holding four sites shown with their favicons.',
    still: '/showcase/bookmarks-1200.webp',
    stillSrcset: '/showcase/bookmarks-1200.webp 1200w, /showcase/bookmarks-2000.webp 2000w',
    width: 1200,
    height: 750,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    caption: 'Every dated item from every list, on one schedule.',
    alt: 'A month view with recurring standups and a monthly review laid across the grid.',
    still: '/showcase/calendar-1200.webp',
    stillSrcset: '/showcase/calendar-1200.webp 1200w, /showcase/calendar-2000.webp 2000w',
    width: 1200,
    height: 750,
  },
  {
    id: 'discover',
    label: 'Discover',
    caption: 'More than 30 curated starter lists, plus whatever the community publishes — clone any of them in a click.',
    alt: 'The Discover catalogue: cards for Food & Cooking, Movies & TV, Travel, Learning and more, each showing its item count.',
    still: '/showcase/discover-1200.webp',
    stillSrcset: '/showcase/discover-1200.webp 1200w, /showcase/discover-2000.webp 2000w',
    width: 1200,
    height: 750,
  },
]

const active = ref(0)
const current = computed(() => slides[active.value])
const isVideo = (s: ShowcaseSlide) => !!s.sources?.length

const root = ref<HTMLElement | null>(null)
const tabsEl = ref<HTMLElement | null>(null)

/**
 * The only JS matchMedia in the app. It exists because the *video* decision
 * can't be expressed in CSS: under reduce we show the poster rather than an
 * autoplaying clip. The slide transition itself is handled declaratively by
 * Tailwind's motion-reduce: variant on the track.
 */
const reduceMotion = ref(false)
let mq: MediaQueryList | null = null
function onMq(e: MediaQueryListEvent | MediaQueryList) {
  reduceMotion.value = e.matches
}

function go(i: number, focusTab = false) {
  active.value = (i + slides.length) % slides.length
  if (focusTab) {
    tabsEl.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[active.value]?.focus()
  }
}

/**
 * WAI-ARIA tabs with automatic activation: arrows move selection and focus
 * together. Right call here — switching is instant and there is nothing to
 * lose by previewing as you arrow along.
 */
function onTabKeydown(e: KeyboardEvent) {
  switch (e.key) {
    case 'ArrowRight': go(active.value + 1, true); break
    case 'ArrowLeft': go(active.value - 1, true); break
    case 'Home': go(0, true); break
    case 'End': go(slides.length - 1, true); break
    default: return
  }
  e.preventDefault()
}

/**
 * Swipe. Deliberately NOT reusing ListView.vue's pointer-drag or
 * useCalendarDrag(): both setPointerCapture() on pointerdown, which would eat
 * vertical page scrolling on a phone. Here the gesture is axis-locked, the
 * pointer is never captured, and the track carries touch-pan-y so the browser
 * keeps vertical scrolling for itself.
 */
const SWIPE_MIN = 40
let swipe: { x: number; y: number; axis: 'x' | 'y' | null } | null = null

function onPointerDown(e: PointerEvent) {
  if (e.pointerType === 'mouse') return // mouse users have tabs, dots and arrows
  swipe = { x: e.clientX, y: e.clientY, axis: null }
}
function onPointerMove(e: PointerEvent) {
  if (!swipe || swipe.axis) return
  const dx = Math.abs(e.clientX - swipe.x)
  const dy = Math.abs(e.clientY - swipe.y)
  if (dx < 8 && dy < 8) return
  swipe.axis = dx > dy ? 'x' : 'y'
}
function onPointerUp(e: PointerEvent) {
  const s = swipe
  swipe = null
  if (!s || s.axis !== 'x') return
  const dx = e.clientX - s.x
  if (Math.abs(dx) < SWIPE_MIN) return
  go(active.value + (dx < 0 ? 1 : -1))
}

/**
 * Off-screen slides sit inside an overflow-hidden box, so loading="lazy" keeps
 * them unfetched — good for first paint, but it means a blank frame the first
 * time you hit a tab. Warm the set once the section nears the viewport, then
 * disconnect.
 */
let io: IntersectionObserver | null = null
function warmAll() {
  for (const s of slides) {
    const img = new Image()
    img.srcset = s.stillSrcset
    img.src = s.still
  }
}

onMounted(() => {
  mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMq(mq)
  mq.addEventListener('change', onMq)

  if (root.value && 'IntersectionObserver' in window) {
    io = new IntersectionObserver(
      (entries) => {
        if (entries.some((en) => en.isIntersecting)) {
          warmAll()
          io?.disconnect()
          io = null
        }
      },
      { rootMargin: '200px' }
    )
    io.observe(root.value)
  } else {
    warmAll()
  }
})

onBeforeUnmount(() => {
  mq?.removeEventListener('change', onMq)
  io?.disconnect()
})
</script>

<template>
  <div ref="root">
    <!-- Tabs — same pill idiom as the in-app ViewSwitcher. -->
    <div
      ref="tabsEl"
      role="tablist"
      aria-label="Product screenshots"
      class="flex flex-wrap justify-center gap-1"
      @keydown="onTabKeydown"
    >
      <button
        v-for="(s, i) in slides"
        :id="`showcase-tab-${s.id}`"
        :key="s.id"
        type="button"
        role="tab"
        :aria-controls="`showcase-panel-${s.id}`"
        :aria-selected="i === active"
        :tabindex="i === active ? 0 : -1"
        class="px-2.5 py-1 rounded-lg text-sm transition-colors"
        :class="i === active
          ? 'bg-accent text-accent-fg font-medium'
          : 'text-muted hover:text-text hover:bg-surface-hover'"
        @click="go(i)"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- Media frame. `group` drives the hover-revealed arrows. -->
    <div class="group relative mt-8">
      <div
        class="rounded-2xl bg-bg ring-1 ring-border-strong shadow-xl overflow-hidden dark:inset-ring dark:inset-ring-white/5"
      >
        <!-- Faux titlebar, matching the hand-built mocks elsewhere on the page. -->
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface/60">
          <span class="size-2.5 rounded-full bg-danger/70" />
          <span class="size-2.5 rounded-full bg-warning-fg/60" />
          <span class="size-2.5 rounded-full bg-success-fg/60" />
          <span class="ml-3 text-xs text-muted font-medium">{{ current.label }}</span>
        </div>

        <div
          class="overflow-hidden touch-pan-y"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="swipe = null"
        >
          <div
            class="flex transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            :style="{ transform: `translateX(-${active * 100}%)` }"
          >
            <!-- `inert` is not on Vue's boolean-attribute list, so :inert="false"
                 would render inert="false" and still inert the panel. Hence the
                 explicit undefined. -->
            <div
              v-for="(s, i) in slides"
              :id="`showcase-panel-${s.id}`"
              :key="s.id"
              role="tabpanel"
              :aria-labelledby="`showcase-tab-${s.id}`"
              :inert="i === active ? undefined : true"
              class="w-full shrink-0"
            >
              <video
                v-if="isVideo(s) && i === active && !reduceMotion"
                class="block aspect-[16/10] w-full object-cover object-top"
                autoplay
                muted
                loop
                playsinline
                preload="metadata"
                :poster="s.still"
                :width="s.width"
                :height="s.height"
                :aria-label="s.alt"
              >
                <source v-for="src in s.sources" :key="src.src" :src="src.src" :type="src.type" />
                <img :src="s.still" :alt="s.alt" :width="s.width" :height="s.height" />
              </video>
              <img
                v-else
                class="block aspect-[16/10] w-full object-cover object-top"
                :src="s.still"
                :srcset="s.stillSrcset"
                sizes="(min-width: 72rem) 1104px, 100vw"
                :alt="s.alt"
                :width="s.width"
                :height="s.height"
                :loading="i === 0 ? 'eager' : 'lazy'"
                decoding="async"
                draggable="false"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Arrows: hover-revealed on pointer devices, always visible where there
           is no hover, and on keyboard focus. -->
      <button
        v-for="dir in ([-1, 1] as const)"
        :key="dir"
        type="button"
        class="absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-surface/80 p-2 text-text ring-1 ring-border-strong backdrop-blur-sm opacity-0 transition hover:bg-surface-hover focus-visible:opacity-100 group-hover:opacity-100 touch:opacity-100"
        :class="dir === -1 ? 'left-2 md:left-4' : 'right-2 md:right-4'"
        :aria-label="dir === -1 ? 'Previous screenshot' : 'Next screenshot'"
        @click="go(active + dir)"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            :d="dir === -1 ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'"
          />
        </svg>
      </button>
    </div>

    <p class="mt-5 text-center text-muted text-balance max-w-2xl mx-auto min-h-[3rem]">
      {{ current.caption }}
    </p>

    <!-- Dots duplicate the tabs, so they're decoration only. -->
    <div class="mt-1 flex justify-center gap-3" aria-hidden="true">
      <button
        v-for="(s, i) in slides"
        :key="s.id"
        type="button"
        tabindex="-1"
        class="size-2.5 rounded-full bg-accent transition-opacity duration-300"
        :class="i === active ? 'opacity-100' : 'opacity-40 hover:opacity-70'"
        @click="go(i)"
      />
    </div>

    <p class="sr-only" aria-live="polite">
      Slide {{ active + 1 }} of {{ slides.length }}: {{ current.label }}
    </p>
  </div>
</template>
