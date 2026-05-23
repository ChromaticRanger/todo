<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const year = new Date().getFullYear()
const scrolled = ref(false)

function onScroll() {
  scrolled.value = window.scrollY > 8
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})

const useCases = [
  {
    title: 'Launching a side project',
    blurb:
      'Ship checklist, the Stripe docs page you keep losing, brand-voice notes, launch date — all in one list. Switch to Kanban for the build.',
    items: [
      { type: 'todo', text: 'Ship MVP to staging' },
      { type: 'bookmark', text: 'stripe.com/docs/payments' },
      { type: 'note', text: 'Voice & tone — playful, plain' },
      { type: 'event', text: 'Launch on HN — Tue 9am' },
    ],
  },
  {
    title: 'Planning a big trip',
    blurb:
      'Visas, vendors, restaurants, packing list, check-in dates. Stop bouncing between Notes, Maps and your inbox.',
    items: [
      { type: 'todo', text: 'Renew passport' },
      { type: 'bookmark', text: 'maps.app.goo.gl/lisbon-pin' },
      { type: 'note', text: 'Hotel confirmation #LX-44219' },
      { type: 'event', text: 'Flight TP1357 — 06:40' },
    ],
  },
  {
    title: 'Job hunt',
    blurb:
      'A Kanban board where each card is a list: job description link, interview prep notes, follow-up tasks.',
    items: [
      { type: 'todo', text: 'Send thank-you note' },
      { type: 'bookmark', text: 'careers.acme.io/senior-eng' },
      { type: 'note', text: 'Prep: system-design rounds' },
      { type: 'event', text: 'Onsite — Thu 14:00' },
    ],
  },
  {
    title: 'Reading & research',
    blurb:
      'Papers, articles, half-formed thoughts and the follow-ups they spawn — kept together instead of scattered across tabs.',
    items: [
      { type: 'bookmark', text: 'arxiv.org/abs/2401.12345' },
      { type: 'note', text: 'Counter-argument: small-sample bias' },
      { type: 'todo', text: 'Email author for raw data' },
      { type: 'bookmark', text: 'goodreads.com/book/show/...' },
    ],
  },
]

const typeMeta: Record<
  'todo' | 'bookmark' | 'note' | 'event',
  { label: string; tone: string }
> = {
  todo: { label: 'Todo', tone: 'bg-accent/15 text-accent ring-accent/30' },
  bookmark: {
    label: 'Bookmark',
    tone: 'bg-emerald-500/15 text-emerald-500 ring-emerald-500/30',
  },
  note: { label: 'Note', tone: 'bg-amber-500/15 text-amber-500 ring-amber-500/30' },
  event: { label: 'Event', tone: 'bg-sky-500/15 text-sky-500 ring-sky-500/30' },
}

const features = [
  {
    title: 'Mixed-item lists',
    body: 'A list can hold todos, bookmarks, notes and events together — because real projects do.',
  },
  {
    title: 'Grid or Kanban',
    body: 'Switch any list between a tidy grid and a drag-and-drop board. Same data, different lens.',
  },
  {
    title: 'Calendar across everything',
    body: 'Every dated item, every list, on one overall schedule. Plan a week without opening a separate app.',
  },
  {
    title: 'Discover & clone',
    body: 'Browse community lists. Found a great packing list or onboarding checklist? Fork it in one click.',
  },
  {
    title: 'Browser extension',
    body: 'Save the current tab to any list without leaving the page. Bookmark manager built in, not bolted on.',
  },
  {
    title: 'Categories, priorities, repeats',
    body: 'Group by category, set H/M/L priorities, schedule weekly reviews. The fiddly bits, done well.',
  },
  {
    title: 'Global search (⌘K)',
    body: 'Find anything across every list in one keystroke. Jump straight to it.',
  },
  {
    title: 'Themes, light & dark',
    body: 'Five colour palettes, both modes. Pick one that doesn’t fight your eyes.',
  },
]
</script>

<template>
  <div class="min-h-dvh bg-bg text-text antialiased">
    <!-- Top nav -->
    <header
      class="sticky top-0 z-30 transition-colors"
      :class="scrolled ? 'bg-bg/80 backdrop-blur border-b border-border' : 'bg-transparent'"
    >
      <nav class="mx-auto max-w-6xl flex items-center justify-between px-6 py-4">
        <a href="/" class="flex items-center gap-2.5 group">
          <img src="/stash-squirrel.svg" alt="" class="size-8" />
          <span class="font-display italic text-xl font-semibold tracking-tight">
            Stash Squirrel
          </span>
        </a>
        <div class="flex items-center gap-2 sm:gap-4">
          <a
            href="#use-cases"
            class="hidden sm:inline text-sm text-muted hover:text-text transition-colors"
          >
            Use cases
          </a>
          <a
            href="#features"
            class="hidden sm:inline text-sm text-muted hover:text-text transition-colors"
          >
            Features
          </a>
          <a
            href="#pricing"
            class="hidden sm:inline text-sm text-muted hover:text-text transition-colors"
          >
            Pricing
          </a>
          <a
            href="/login"
            class="text-sm text-muted hover:text-text transition-colors"
          >
            Sign in
          </a>
          <a
            href="/login?mode=signup"
            class="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Get started
          </a>
        </div>
      </nav>
    </header>

    <!-- Hero -->
    <section class="relative overflow-hidden">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style="background: radial-gradient(60% 50% at 50% 0%, color-mix(in oklab, var(--color-accent) 30%, transparent), transparent 70%);"
      />
      <div class="mx-auto max-w-4xl px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
        <p
          class="inline-flex items-center gap-2 rounded-full bg-surface ring-1 ring-ring px-3 py-1 text-xs text-muted mb-6"
        >
          <span class="size-1.5 rounded-full bg-accent" />
          Todos · Bookmarks · Notes · Events — one list
        </p>
        <h1
          class="font-display italic text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-balance leading-[1.05]"
        >
          A workspace for everything
          <span
            class="bg-gradient-to-br from-[#e53b30] via-[#c92c24] to-[#8b2a1f] bg-clip-text text-transparent"
          >
            a project needs.
          </span>
        </h1>
        <p class="mt-6 text-lg sm:text-xl text-muted text-balance max-w-2xl mx-auto">
          Todos, bookmarks and notes — together in one list. Kanban when you need a
          board, calendar when you need a date. Share your lists, or start from
          someone else’s.
        </p>
        <div class="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/login?mode=signup"
            class="rounded-xl bg-accent px-5 py-3 text-base font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Get started — it’s free
          </a>
          <a
            href="#use-cases"
            class="rounded-xl bg-surface ring-1 ring-ring px-5 py-3 text-base font-medium text-text transition-colors hover:bg-surface-hover"
          >
            See it in action
          </a>
        </div>
        <p class="mt-5 text-xs text-muted">
          No credit card. Free forever for casual use.
        </p>
      </div>
    </section>

    <!-- Problem / solution -->
    <section class="border-t border-border bg-surface/40">
      <div class="mx-auto max-w-6xl px-6 py-20">
        <div class="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-accent">
              The problem
            </p>
            <h2
              class="mt-3 font-display italic text-4xl font-semibold tracking-tight text-balance"
            >
              Your project lives in four different apps.
            </h2>
            <p class="mt-5 text-muted text-lg leading-relaxed">
              Tasks in one app. Bookmarks in another. Notes in a third. Dates in a
              calendar. The connective tissue — the thing that makes them
              <em>your project</em> — only exists in your head.
            </p>
            <p class="mt-4 text-muted text-lg leading-relaxed">
              Stash Squirrel puts them on one page. The list is the project. It holds
              whatever the project needs.
            </p>
          </div>

          <!-- Mock list -->
          <div class="rounded-2xl bg-bg ring-1 ring-border-strong shadow-xl overflow-hidden dark:inset-ring dark:inset-ring-white/5">
            <div class="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface/60">
              <span class="size-2.5 rounded-full bg-danger/70" />
              <span class="size-2.5 rounded-full bg-warning-fg/60" />
              <span class="size-2.5 rounded-full bg-success-fg/60" />
              <span class="ml-3 text-xs text-muted font-medium">Lisbon trip</span>
            </div>
            <ul class="divide-y divide-border">
              <li
                v-for="(item, i) in useCases[1].items"
                :key="i"
                class="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span
                  class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1"
                  :class="typeMeta[item.type as keyof typeof typeMeta].tone"
                >
                  {{ typeMeta[item.type as keyof typeof typeMeta].label }}
                </span>
                <span class="text-text truncate">{{ item.text }}</span>
              </li>
            </ul>
            <div class="px-4 py-2.5 border-t border-border bg-surface/40 text-[11px] text-muted">
              One list. Four kinds of thing. No app-switching.
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Use cases -->
    <section id="use-cases" class="border-t border-border">
      <div class="mx-auto max-w-6xl px-6 py-20">
        <div class="text-center max-w-2xl mx-auto">
          <p class="text-xs font-semibold uppercase tracking-wider text-accent">
            Built for
          </p>
          <h2
            class="mt-3 font-display italic text-4xl font-semibold tracking-tight text-balance"
          >
            Small projects with a lot of moving parts.
          </h2>
          <p class="mt-4 text-muted text-lg text-balance">
            Too small for Notion or Asana. Too organised for a Google Doc.
            Stash Squirrel sits exactly where most of life actually happens.
          </p>
        </div>

        <div class="mt-12 grid gap-6 sm:grid-cols-2">
          <article
            v-for="uc in useCases"
            :key="uc.title"
            class="rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5"
          >
            <h3 class="font-display italic text-2xl font-semibold tracking-tight">
              {{ uc.title }}
            </h3>
            <p class="mt-2 text-muted">{{ uc.blurb }}</p>
            <ul class="mt-5 space-y-2">
              <li
                v-for="(item, i) in uc.items"
                :key="i"
                class="flex items-center gap-2.5 text-sm"
              >
                <span
                  class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1"
                  :class="typeMeta[item.type as keyof typeof typeMeta].tone"
                >
                  {{ typeMeta[item.type as keyof typeof typeMeta].label }}
                </span>
                <span class="text-text/90 truncate">{{ item.text }}</span>
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>

    <!-- Discover -->
    <section class="border-t border-border bg-surface/40">
      <div class="mx-auto max-w-6xl px-6 py-20">
        <div class="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div class="order-2 lg:order-1">
            <!-- Mock discover cards -->
            <div class="grid grid-cols-2 gap-3">
              <div
                v-for="(t, i) in [
                  { title: '10 days in Lisbon', count: '24 items', kind: 'Travel' },
                  { title: 'Sourdough — week 1', count: '12 items', kind: 'Cooking' },
                  { title: 'Freelance onboarding', count: '18 items', kind: 'Work' },
                  { title: 'Household chores', count: '31 items', kind: 'Home' },
                ]"
                :key="i"
                class="rounded-xl bg-bg ring-1 ring-border-strong p-4 dark:inset-ring dark:inset-ring-white/5"
              >
                <p class="text-[10px] font-semibold uppercase tracking-wider text-accent">
                  {{ t.kind }}
                </p>
                <h4 class="mt-1 text-sm font-semibold text-text">{{ t.title }}</h4>
                <p class="mt-3 text-xs text-muted">{{ t.count }} · fork in one click</p>
              </div>
            </div>
          </div>

          <div class="order-1 lg:order-2">
            <p class="text-xs font-semibold uppercase tracking-wider text-accent">
              Discover
            </p>
            <h2
              class="mt-3 font-display italic text-4xl font-semibold tracking-tight text-balance"
            >
              Start from someone else’s playbook.
            </h2>
            <p class="mt-5 text-muted text-lg leading-relaxed">
              Browse lists published by the community — packing lists, reading lists,
              onboarding checklists, project templates. Fork the ones you like into
              your own account and edit freely. Publish your own when you’ve built
              something worth sharing.
            </p>
            <p class="mt-4 text-muted text-lg leading-relaxed">
              No more starting from a blank canvas.
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section id="features" class="border-t border-border">
      <div class="mx-auto max-w-6xl px-6 py-20">
        <div class="text-center max-w-2xl mx-auto">
          <p class="text-xs font-semibold uppercase tracking-wider text-accent">
            Everything in one place
          </p>
          <h2
            class="mt-3 font-display italic text-4xl font-semibold tracking-tight text-balance"
          >
            The features you’d expect. None of the ones you wouldn’t.
          </h2>
        </div>

        <div class="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="f in features"
            :key="f.title"
            class="rounded-xl bg-surface ring-1 ring-ring p-5 dark:inset-ring dark:inset-ring-white/5"
          >
            <h3 class="font-semibold text-text">{{ f.title }}</h3>
            <p class="mt-2 text-sm text-muted leading-relaxed">{{ f.body }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing teaser -->
    <section id="pricing" class="border-t border-border bg-surface/40">
      <div class="mx-auto max-w-4xl px-6 py-20 text-center">
        <p class="text-xs font-semibold uppercase tracking-wider text-accent">
          Pricing
        </p>
        <h2
          class="mt-3 font-display italic text-4xl font-semibold tracking-tight text-balance"
        >
          Free for casual use. £6/month when you want it all.
        </h2>
        <p class="mt-5 text-muted text-lg text-balance max-w-xl mx-auto">
          Up to 3 lists and 50 items on Free, forever. Go Pro for unlimited lists,
          Calendar, Discover, global search and the browser extension.
        </p>
        <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/login?mode=signup"
            class="rounded-xl bg-accent px-5 py-3 text-base font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Get started — it’s free
          </a>
          <a
            href="/login"
            class="rounded-xl bg-surface ring-1 ring-ring px-5 py-3 text-base font-medium text-text transition-colors hover:bg-surface-hover"
          >
            Sign in
          </a>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-border">
      <div
        class="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted"
      >
        <div class="flex items-center gap-2.5">
          <img src="/stash-squirrel.svg" alt="" class="size-6" />
          <span class="font-display italic font-semibold text-text">Stash Squirrel</span>
          <span class="text-muted">· © {{ year }}</span>
        </div>
        <div class="flex items-center gap-5">
          <a href="/privacy.html" class="hover:text-text transition-colors">Privacy</a>
          <a href="/login" class="hover:text-text transition-colors">Sign in</a>
          <a
            href="/login?mode=signup"
            class="hover:text-text transition-colors"
          >
            Get started
          </a>
        </div>
      </div>
    </footer>
  </div>
</template>
