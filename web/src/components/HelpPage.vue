<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  helpSections,
  findSection,
  findTopic,
  filterTopics,
  type HelpTopic,
} from '../lib/helpContent'
import { renderMarkdown } from '../lib/markdown'

// Public page — no auth, no stores. Internal navigation is pushState-based so
// /help, /help/<section> and /help/<section>/<topic> are all real, shareable
// URLs (the prod catch-all and Vite's SPA fallback both serve index.html).

const currentSection = ref<string | null>(null)
const currentTopic = ref<string | null>(null)
const filter = ref('')

function readPath() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  // parts: ['help', section?, topic?]
  currentSection.value = parts[1] ?? null
  currentTopic.value = parts[2] ?? null
}

function navigate(sectionSlug: string | null, topicSlug: string | null = null) {
  const path =
    sectionSlug == null
      ? '/help'
      : topicSlug == null
        ? `/help/${sectionSlug}`
        : `/help/${sectionSlug}/${topicSlug}`
  if (window.location.pathname !== path) {
    window.history.pushState(null, '', path)
  }
  currentSection.value = sectionSlug
  currentTopic.value = topicSlug
  filter.value = ''
  window.scrollTo({ top: 0 })
}

onMounted(() => {
  readPath()
  window.addEventListener('popstate', readPath)
})
onUnmounted(() => window.removeEventListener('popstate', readPath))

const section = computed(() => (currentSection.value ? findSection(currentSection.value) : undefined))
const topic = computed(() =>
  currentSection.value && currentTopic.value
    ? findTopic(currentSection.value, currentTopic.value)
    : undefined
)

const topicHtml = computed(() => (topic.value ? renderMarkdown(topic.value.body) : ''))

const filterResults = computed(() => filterTopics(filter.value))
const filtering = computed(() => filter.value.trim().length > 0)

// Prev/next within the current section for footer navigation
const neighbours = computed<{ prev: HelpTopic | null; next: HelpTopic | null }>(() => {
  if (!section.value || !topic.value) return { prev: null, next: null }
  const idx = section.value.topics.findIndex((t) => t.slug === topic.value!.slug)
  return {
    prev: section.value.topics[idx - 1] ?? null,
    next: section.value.topics[idx + 1] ?? null,
  }
})

watch(topic, (t) => {
  document.title = t
    ? `${t.title} — Stash Squirrel Help`
    : section.value
      ? `${section.value.title} — Stash Squirrel Help`
      : 'Help — Stash Squirrel'
}, { immediate: true })
</script>

<template>
  <div class="min-h-dvh bg-bg text-text">
    <!-- Page header -->
    <header class="border-b border-border bg-surface">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href="/" class="flex items-center gap-2 rounded-lg -m-1 p-1 hover:bg-surface-hover transition-colors">
          <img src="/stash-squirrel.svg" alt="" class="size-8" />
          <span class="font-display italic text-lg font-semibold tracking-tight bg-gradient-to-br from-[#e53b30] via-[#c92c24] to-[#8b2a1f] bg-clip-text text-transparent">
            Stash Squirrel
          </span>
          <span class="ml-1 text-sm font-medium text-muted">Help</span>
        </a>
        <a
          href="/"
          class="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover transition-colors"
        >
          Open Stash Squirrel
        </a>
      </div>
    </header>

    <div class="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 md:grid-cols-[15rem_1fr]">
      <!-- Sidebar -->
      <aside class="md:sticky md:top-8 md:self-start">
        <input
          v-model="filter"
          type="search"
          placeholder="Filter topics…"
          class="mb-4 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <nav class="space-y-4">
          <button
            type="button"
            class="text-sm font-medium transition-colors"
            :class="!currentSection ? 'text-accent' : 'text-muted hover:text-text'"
            @click="navigate(null)"
          >
            Help home
          </button>
          <div v-for="s in helpSections" :key="s.slug">
            <button
              type="button"
              class="mb-1 block text-sm font-semibold transition-colors"
              :class="s.slug === currentSection && !currentTopic ? 'text-accent' : 'text-text hover:text-accent'"
              @click="navigate(s.slug)"
            >
              {{ s.title }}
            </button>
            <ul class="space-y-0.5 border-l border-border pl-3">
              <li v-for="t in s.topics" :key="t.slug">
                <button
                  type="button"
                  class="block w-full text-left text-[13px] leading-5 transition-colors"
                  :class="s.slug === currentSection && t.slug === currentTopic
                    ? 'text-accent font-medium'
                    : 'text-muted hover:text-text'"
                  @click="navigate(s.slug, t.slug)"
                >
                  {{ t.title }}
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <!-- Main content -->
      <main class="min-w-0">
        <!-- Filter results -->
        <div v-if="filtering">
          <h1 class="mb-4 text-xl font-semibold">
            {{ filterResults.length ? `Topics matching “${filter.trim()}”` : `No topics match “${filter.trim()}”` }}
          </h1>
          <ul class="space-y-3">
            <li v-for="t in filterResults" :key="`${t.section}/${t.slug}`">
              <button
                type="button"
                class="block w-full rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-accent/60 transition-colors"
                @click="navigate(t.section, t.slug)"
              >
                <span class="flex items-center gap-2 text-sm font-semibold text-text">
                  {{ t.title }}
                  <span v-if="t.plan === 'pro'" class="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">Pro</span>
                </span>
                <span class="mt-0.5 block text-sm text-muted">{{ t.summary }}</span>
              </button>
            </li>
          </ul>
        </div>

        <!-- Topic article -->
        <article v-else-if="topic && section">
          <p class="mb-2 text-sm text-muted">
            <button type="button" class="hover:text-text transition-colors" @click="navigate(section.slug)">
              {{ section.title }}
            </button>
          </p>
          <h1 class="flex items-center gap-3 text-2xl font-semibold">
            {{ topic.title }}
            <span v-if="topic.plan === 'pro'" class="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">Pro</span>
          </h1>
          <p class="mt-1 text-muted">{{ topic.summary }}</p>
          <div class="help-markdown mt-6" v-html="topicHtml" />

          <nav class="mt-10 flex items-center justify-between gap-4 border-t border-border pt-4 text-sm">
            <button
              v-if="neighbours.prev"
              type="button"
              class="text-muted hover:text-text transition-colors"
              @click="navigate(section.slug, neighbours.prev.slug)"
            >
              ← {{ neighbours.prev.title }}
            </button>
            <span v-else />
            <button
              v-if="neighbours.next"
              type="button"
              class="text-right text-muted hover:text-text transition-colors"
              @click="navigate(section.slug, neighbours.next.slug)"
            >
              {{ neighbours.next.title }} →
            </button>
          </nav>
        </article>

        <!-- Section index -->
        <div v-else-if="section">
          <h1 class="text-2xl font-semibold">{{ section.title }}</h1>
          <p class="mt-1 text-muted">{{ section.blurb }}</p>
          <ul class="mt-6 space-y-3">
            <li v-for="t in section.topics" :key="t.slug">
              <button
                type="button"
                class="block w-full rounded-xl border border-border bg-surface px-4 py-3 text-left hover:border-accent/60 transition-colors"
                @click="navigate(section.slug, t.slug)"
              >
                <span class="flex items-center gap-2 text-sm font-semibold text-text">
                  {{ t.title }}
                  <span v-if="t.plan === 'pro'" class="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">Pro</span>
                </span>
                <span class="mt-0.5 block text-sm text-muted">{{ t.summary }}</span>
              </button>
            </li>
          </ul>
        </div>

        <!-- Help home -->
        <div v-else>
          <h1 class="text-2xl font-semibold">How can we help?</h1>
          <p class="mt-1 text-muted">
            Guides to every part of Stash Squirrel, from your first list to publishing on Discover.
          </p>
          <div class="mt-6 grid gap-4 sm:grid-cols-2">
            <button
              v-for="s in helpSections"
              :key="s.slug"
              type="button"
              class="rounded-xl border border-border bg-surface px-4 py-4 text-left hover:border-accent/60 transition-colors"
              @click="navigate(s.slug)"
            >
              <span class="block text-base font-semibold text-text">{{ s.title }}</span>
              <span class="mt-1 block text-sm text-muted">{{ s.blurb }}</span>
              <span class="mt-2 block text-xs text-muted">
                {{ s.topics.length }} {{ s.topics.length === 1 ? 'guide' : 'guides' }}
              </span>
            </button>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
