<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useDiscoverStore } from '../stores/discoverStore'
import { useAuthStore } from '../stores/authStore'
import { useListStore } from '../stores/listStore'
import { useTodoStore } from '../stores/todoStore'
import { LIST_CATEGORIES } from '../shared/listCategories'
import SharedItemTile from './SharedItemTile.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const emit = defineEmits<{ 'cloned-to-list': [name: string] }>()

const discover = useDiscoverStore()
const authStore = useAuthStore()
const listStore = useListStore()
const todoStore = useTodoStore()

const cloning = ref(false)
const cloneError = ref('')
const showUnpublishConfirm = ref(false)

onMounted(() => {
  void discover.fetchLists()
})

watch(
  () => discover.selectedSlug,
  (slug) => {
    if (slug && (!discover.detail || discover.detail.list.slug !== slug)) {
      void discover.fetchDetail(slug)
    }
  }
)

const publisherInput = ref(discover.filterPublisher)
let publisherDebounce: ReturnType<typeof setTimeout> | null = null
watch(publisherInput, (val) => {
  if (publisherDebounce) clearTimeout(publisherDebounce)
  publisherDebounce = setTimeout(() => {
    discover.filterPublisher = val
  }, 250)
})

watch(
  [() => discover.filterCategory, () => discover.filterPublisher],
  () => {
    if (!discover.selectedSlug) void discover.fetchLists()
  }
)

const hasActiveFilters = computed(
  () => discover.filterCategory !== null || discover.filterPublisher.trim() !== ''
)

function clearFilters() {
  discover.filterCategory = null
  discover.filterPublisher = ''
  publisherInput.value = ''
}

function filterByCategory(category: string) {
  discover.filterCategory = category as typeof discover.filterCategory
}

function filterByPublisher(publisher: string) {
  publisherInput.value = publisher
  discover.filterPublisher = publisher
}

const isOwner = computed(
  () => discover.detail?.list.owner_user_id === authStore.user?.id
)

function selectList(slug: string) {
  discover.selectSlug(slug)
}

function backToCatalogue() {
  discover.selectSlug(null)
}

async function cloneCurrentList() {
  if (!discover.detail || cloning.value) return
  cloning.value = true
  cloneError.value = ''
  try {
    const result = await discover.clone(discover.detail.list.slug)
    if (!result) {
      cloneError.value = discover.error || 'Clone failed'
      return
    }
    await listStore.fetchLists()
    listStore.setActiveList(result.list_name)
    await todoStore.fetchTodos(result.list_name, 'all')
    emit('cloned-to-list', result.list_name)
  } finally {
    cloning.value = false
  }
}

function unpublishCurrentList() {
  if (!discover.detail) return
  showUnpublishConfirm.value = true
}

async function confirmUnpublish() {
  if (!discover.detail) {
    showUnpublishConfirm.value = false
    return
  }
  const slug = discover.detail.list.slug
  showUnpublishConfirm.value = false
  const ok = await discover.unpublish(slug)
  if (ok) {
    await discover.fetchLists()
    void discover.fetchPublications()
    discover.selectSlug(null)
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto p-6">
    <!-- Catalogue view -->
    <template v-if="!discover.selectedSlug">
      <div class="max-w-5xl mx-auto">
        <div class="mb-6">
          <h1 class="text-2xl font-semibold text-text">Discover</h1>
          <p class="text-sm text-muted mt-1">
            Browse curated and community lists. Clone any of them into your own lists to start using or editing.
          </p>
        </div>

        <div class="mb-6 flex flex-col sm:flex-row gap-2 sm:items-center">
          <label class="sm:flex-1 min-w-0">
            <span class="sr-only">Category</span>
            <select
              v-model="discover.filterCategory"
              class="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
            >
              <option :value="null">All categories</option>
              <option v-for="c in LIST_CATEGORIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="sm:flex-1 min-w-0">
            <span class="sr-only">Publisher</span>
            <input
              v-model="publisherInput"
              type="search"
              placeholder="Search by publisher…"
              class="w-full bg-surface border border-border-strong rounded-lg px-3 py-2 text-sm text-text focus:outline-none focus:border-accent"
            />
          </label>
          <button
            v-if="hasActiveFilters"
            type="button"
            class="shrink-0 px-3 py-2 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-hover transition-colors"
            @click="clearFilters"
          >
            Clear
          </button>
        </div>

        <div v-if="discover.loading && discover.lists.length === 0" class="flex justify-center py-16">
          <div class="size-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>

        <div
          v-else-if="discover.error"
          class="rounded-xl border border-danger/40 bg-danger-bg/50 text-danger-fg px-4 py-3 text-sm"
        >
          {{ discover.error }}
        </div>

        <div
          v-else-if="discover.lists.length === 0"
          class="rounded-xl border border-border-strong/40 bg-surface px-6 py-12 text-center text-muted"
        >
          <template v-if="hasActiveFilters">
            <p>No lists match these filters.</p>
            <button
              type="button"
              class="mt-3 px-3 py-1.5 rounded-lg text-sm text-accent hover:bg-surface-hover transition-colors"
              @click="clearFilters"
            >
              Clear filters
            </button>
          </template>
          <template v-else>
            No community lists yet. Be the first — publish one of your own lists.
          </template>
        </div>

        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="list in discover.lists"
            :key="list.slug"
            role="button"
            tabindex="0"
            class="text-left bg-surface border border-border-strong/60 rounded-xl p-5 hover:border-accent/60 hover:bg-surface-hover/40 transition-colors cursor-pointer dark:inset-ring dark:inset-ring-white/5 focus:outline-none focus:border-accent"
            @click="selectList(list.slug)"
            @keydown.enter.prevent="selectList(list.slug)"
            @keydown.space.prevent="selectList(list.slug)"
          >
            <div class="flex items-start justify-between gap-3 mb-2">
              <div class="flex items-center gap-2 min-w-0">
                <span v-if="list.icon" class="text-2xl shrink-0" aria-hidden="true">{{ list.icon }}</span>
                <h2 class="text-lg font-semibold text-text truncate">{{ list.name }}</h2>
              </div>
              <span
                v-if="list.owner_is_system"
                class="shrink-0 rounded-full bg-accent/15 text-accent text-[10px] font-semibold px-2 py-0.5 tracking-wide"
                title="Curated by Stash Squirrel"
              >Official</span>
              <span
                v-else
                class="shrink-0 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold px-2 py-0.5 tracking-wide"
                title="Published by a community member"
              >Community</span>
            </div>
            <p v-if="list.description" class="text-sm text-muted line-clamp-3">
              {{ list.description }}
            </p>
            <div class="flex items-center gap-x-2 gap-y-1 mt-3 text-xs text-muted flex-wrap">
              <span>{{ list.item_count }} item{{ list.item_count === 1 ? '' : 's' }}</span>
              <span aria-hidden="true">·</span>
              <span>by</span>
              <button
                type="button"
                :title="`Show lists by ${list.owner_name}`"
                class="text-accent hover:underline truncate max-w-[10rem]"
                @click.stop="filterByPublisher(list.owner_name)"
                @keydown.enter.stop
                @keydown.space.stop
              >{{ list.owner_name }}</button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                :title="`Show lists in ${list.category}`"
                class="text-accent hover:underline truncate max-w-[10rem]"
                @click.stop="filterByCategory(list.category)"
                @keydown.enter.stop
                @keydown.space.stop
              >{{ list.category }}</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Detail view -->
    <template v-else>
      <div class="max-w-4xl mx-auto">
        <button
          type="button"
          class="flex items-center gap-1.5 text-sm text-muted hover:text-text mb-4 transition-colors"
          @click="backToCatalogue"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Discover
        </button>

        <div v-if="discover.loading" class="flex justify-center py-16">
          <div class="size-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>

        <div
          v-else-if="discover.error || !discover.detail"
          class="rounded-xl border border-danger/40 bg-danger-bg/50 text-danger-fg px-4 py-3 text-sm"
        >
          {{ discover.error || 'List not found' }}
        </div>

        <template v-else>
          <header class="mb-6 flex items-start justify-between gap-4">
            <div class="min-w-0">
              <div class="flex items-center gap-3 mb-1">
                <span v-if="discover.detail.list.icon" class="text-3xl" aria-hidden="true">{{ discover.detail.list.icon }}</span>
                <h1 class="text-2xl font-semibold text-text">{{ discover.detail.list.name }}</h1>
                <span
                  v-if="discover.detail.list.owner_is_system"
                  class="rounded-full bg-accent/15 text-accent text-[10px] font-semibold px-2 py-0.5 tracking-wide"
                >Official</span>
                <span
                  v-else
                  class="rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold px-2 py-0.5 tracking-wide"
                >Community</span>
              </div>
              <p v-if="discover.detail.list.description" class="text-sm text-muted">
                {{ discover.detail.list.description }}
              </p>
              <p class="text-xs text-muted mt-1">
                by {{ discover.detail.list.owner_name }} · updated {{ formatDate(discover.detail.list.updated_at) }}
              </p>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              <button
                v-if="isOwner"
                type="button"
                class="px-3 py-2 rounded-lg text-sm text-muted hover:text-danger hover:bg-surface-hover transition-colors"
                @click="unpublishCurrentList"
              >
                Unpublish
              </button>
              <button
                type="button"
                :disabled="cloning"
                class="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-wait"
                @click="cloneCurrentList"
              >
                {{ cloning ? 'Cloning…' : 'Clone to my lists' }}
              </button>
            </div>
          </header>

          <p
            v-if="cloneError"
            class="rounded-xl border border-danger/40 bg-danger-bg/50 text-danger-fg px-4 py-3 text-sm mb-4"
          >
            {{ cloneError }}
          </p>

          <div class="space-y-6">
            <section
              v-for="cat in discover.detail.categories"
              :key="cat.name"
              class="bg-surface border border-border-strong/60 rounded-xl overflow-hidden dark:inset-ring dark:inset-ring-white/5"
            >
              <div class="px-4 py-2 border-b border-border-strong/60 bg-surface-hover/40">
                <h3 class="text-sm font-semibold text-muted uppercase tracking-wider">{{ cat.name }}</h3>
              </div>
              <div class="p-4 flex flex-wrap gap-2">
                <SharedItemTile
                  v-for="item in cat.items"
                  :key="item.id"
                  :item="item"
                />
              </div>
            </section>
          </div>
        </template>
      </div>
    </template>

    <ConfirmDialog
      v-if="showUnpublishConfirm"
      message="Remove this list from the community catalogue? Existing clones in other users' accounts are unaffected."
      confirm-label="Unpublish"
      @confirm="confirmUnpublish"
      @cancel="showUnpublishConfirm = false"
    />
  </div>
</template>
