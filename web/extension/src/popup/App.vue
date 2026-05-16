<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { CONNECT_URL, WEB_ORIGIN } from '../lib/config'
import { getToken } from '../lib/auth'
import {
  ApiError,
  NotConnectedError,
  createBookmark,
  fetchCategories,
  fetchLists,
  revokeToken,
} from '../lib/api'

type Status = 'checking' | 'disconnected' | 'loading' | 'ready' | 'saving' | 'saved' | 'error'

const status = ref<Status>('checking')
const errorMessage = ref('')

const lists = ref<string[]>([])
const categories = ref<string[]>([])

const tabTitle = ref('')
const tabUrl = ref('')
const tabFavicon = ref('')

const form = ref({
  title: '',
  list: '',
  category: '',
  description: '',
})

const LAST_USED_KEY = 'lastUsed'

const noPlan = computed(() =>
  status.value === 'error' && /no[_\s-]?plan/i.test(errorMessage.value)
)

// "stashsquirrel.com/foo" rather than the full https://… for the preview card.
const tabHost = computed(() => {
  try {
    return tabUrl.value ? new URL(tabUrl.value).host : ''
  } catch {
    return tabUrl.value
  }
})

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  tabTitle.value = tab?.title ?? ''
  tabUrl.value = tab?.url ?? ''
  tabFavicon.value = tab?.favIconUrl ?? ''
  if (!form.value.title) form.value.title = tabTitle.value
}

async function loadLastUsed() {
  const data = await chrome.storage.local.get([LAST_USED_KEY])
  const last = data[LAST_USED_KEY] as { list?: string; category?: string } | undefined
  if (last?.list) form.value.list = last.list
  if (last?.category) form.value.category = last.category
}

async function saveLastUsed(list: string, category: string) {
  await chrome.storage.local.set({ [LAST_USED_KEY]: { list, category } })
}

async function refresh() {
  errorMessage.value = ''
  const stored = await getToken()
  if (!stored) {
    status.value = 'disconnected'
    return
  }
  status.value = 'loading'
  try {
    lists.value = await fetchLists()
    if (!form.value.list && lists.value.length > 0) {
      form.value.list = lists.value[0]
    }
    status.value = 'ready'
  } catch (err) {
    if (err instanceof NotConnectedError) {
      status.value = 'disconnected'
      return
    }
    setError(err)
  }
}

function setError(err: unknown) {
  if (err instanceof ApiError) {
    errorMessage.value = err.message
  } else if (err instanceof Error) {
    errorMessage.value = err.message
  } else {
    errorMessage.value = String(err)
  }
  status.value = 'error'
}

async function loadCategoriesForList(list: string) {
  if (!list) {
    categories.value = []
    return
  }
  try {
    categories.value = await fetchCategories(list)
  } catch (err) {
    if (err instanceof NotConnectedError) {
      status.value = 'disconnected'
      return
    }
    categories.value = []
  }
}

watch(() => form.value.list, (list) => {
  loadCategoriesForList(list)
})

// Native <datalist> filters its dropdown to options that contain the input's
// current value. Pre-filled "last used" values would otherwise hide every
// other option, so we clear on focus and restore on blur if the user didn't
// pick or type anything.
const listBeforeFocus = ref('')
const categoryBeforeFocus = ref('')

function onListFocus() {
  listBeforeFocus.value = form.value.list
  form.value.list = ''
}
function onListBlur() {
  if (!form.value.list.trim()) form.value.list = listBeforeFocus.value
}
function onCategoryFocus() {
  categoryBeforeFocus.value = form.value.category
  form.value.category = ''
}
function onCategoryBlur() {
  if (!form.value.category.trim()) form.value.category = categoryBeforeFocus.value
}

function openConnect() {
  chrome.tabs.create({ url: CONNECT_URL })
  window.addEventListener('focus', refresh, { once: true })
}

async function save() {
  if (!form.value.title.trim() || !tabUrl.value || !form.value.list.trim()) return
  status.value = 'saving'
  errorMessage.value = ''
  try {
    await createBookmark({
      list_name: form.value.list.trim(),
      title: form.value.title.trim(),
      url: tabUrl.value,
      category: form.value.category.trim() || undefined,
      description: form.value.description.trim() || undefined,
    })
    await saveLastUsed(form.value.list.trim(), form.value.category.trim())
    status.value = 'saved'
    setTimeout(() => window.close(), 800)
  } catch (err) {
    if (err instanceof NotConnectedError) {
      status.value = 'disconnected'
      return
    }
    setError(err)
  }
}

async function disconnect() {
  await revokeToken()
  lists.value = []
  categories.value = []
  status.value = 'disconnected'
}

function openWebApp() {
  chrome.tabs.create({ url: WEB_ORIGIN })
}

const isConnected = computed(
  () => status.value !== 'checking' && status.value !== 'disconnected'
)

const showForm = computed(
  () =>
    status.value === 'ready' ||
    status.value === 'saving' ||
    status.value === 'saved' ||
    (status.value === 'error' && !noPlan.value)
)

onMounted(async () => {
  await Promise.all([readActiveTab(), loadLastUsed()])
  await refresh()
})
</script>

<template>
  <main class="antialiased isolate">
    <header
      class="flex items-center gap-2.5 bg-[var(--color-brand-tint)] px-4 py-3 ring-1 ring-black/5"
    >
      <img
        src="/stash-squirrel.svg"
        alt=""
        aria-hidden="true"
        class="h-8 w-auto shrink-0 drop-shadow-sm"
      />
      <div class="min-w-0 flex-1">
        <p class="font-display text-base font-semibold tracking-tight text-text">
          Stash Squirrel
        </p>
        <p class="text-xs text-muted truncate">
          {{ status === 'disconnected' ? 'Save bookmarks from any page' : tabHost || 'Save the current page' }}
        </p>
      </div>
    </header>

    <div class="p-4">
      <!-- Checking storage -->
      <div v-if="status === 'checking'" class="py-2 text-sm text-muted">
        Loading…
      </div>

      <!-- Disconnected: brand-forward connect prompt -->
      <div v-else-if="status === 'disconnected'" class="flex flex-col items-center gap-4 py-4 text-center">
        <p class="text-sm text-text text-balance">
          Sign in once at <span class="font-medium">stashsquirrel.com</span> to link this extension to your account.
        </p>
        <button
          type="button"
          class="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm shadow-black/5 transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="openConnect"
        >
          Connect to Stash Squirrel
        </button>
      </div>

      <!-- Loading lists -->
      <div v-else-if="status === 'loading'" class="flex items-center gap-2 py-2 text-sm text-muted">
        <span class="inline-block size-2 animate-pulse rounded-full bg-accent" />
        Loading your lists…
      </div>

      <!-- Form -->
      <form
        v-else-if="showForm"
        class="space-y-3.5"
        @submit.prevent="save"
      >
        <!-- Active-tab preview: favicon + URL line above the editable title -->
        <div class="space-y-2">
          <div class="flex items-center gap-2 rounded-md bg-surface px-2.5 py-1.5 ring-1 ring-black/5">
            <img
              v-if="tabFavicon"
              :src="tabFavicon"
              alt=""
              aria-hidden="true"
              class="size-4 shrink-0"
            />
            <span v-else class="inline-block size-4 shrink-0 rounded-sm bg-border" aria-hidden="true" />
            <span class="truncate text-xs text-muted">{{ tabHost }}</span>
          </div>

          <div>
            <label for="ext-title" class="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              Title
            </label>
            <input
              id="ext-title"
              v-model="form.title"
              name="title"
              type="text"
              class="w-full rounded-md bg-bg px-2.5 py-2 text-sm text-text ring-1 ring-black/10 outline-none transition focus:ring-2 focus:ring-accent -outline-offset-1"
              required
            />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label for="ext-list" class="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              List
            </label>
            <div class="relative">
              <input
                id="ext-list"
                v-model="form.list"
                list="ext-lists"
                name="list"
                type="text"
                class="w-full rounded-md bg-bg pl-2.5 pr-7 py-2 text-sm text-text ring-1 ring-black/10 outline-none transition focus:ring-2 focus:ring-accent -outline-offset-1"
                placeholder="Choose or add"
                required
                @focus="onListFocus"
                @blur="onListBlur"
              />
              <svg
                viewBox="0 0 8 5"
                width="8"
                height="5"
                fill="none"
                aria-hidden="true"
                class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
              >
                <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
              </svg>
            </div>
            <datalist id="ext-lists">
              <option v-for="l in lists" :key="l" :value="l" />
            </datalist>
          </div>
          <div>
            <label for="ext-category" class="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
              Category
            </label>
            <div class="relative">
              <input
                id="ext-category"
                v-model="form.category"
                list="ext-categories"
                name="category"
                type="text"
                class="w-full rounded-md bg-bg pl-2.5 pr-7 py-2 text-sm text-text ring-1 ring-black/10 outline-none transition focus:ring-2 focus:ring-accent -outline-offset-1"
                placeholder="Optional"
                @focus="onCategoryFocus"
                @blur="onCategoryBlur"
              />
              <svg
                viewBox="0 0 8 5"
                width="8"
                height="5"
                fill="none"
                aria-hidden="true"
                class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
              >
                <path d="M.5.5 4 4 7.5.5" stroke="currentColor" />
              </svg>
            </div>
            <datalist id="ext-categories">
              <option v-for="c in categories" :key="c" :value="c" />
            </datalist>
          </div>
        </div>

        <div>
          <label for="ext-notes" class="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
            Notes <span class="font-normal normal-case tracking-normal text-muted/70">— optional</span>
          </label>
          <textarea
            id="ext-notes"
            v-model="form.description"
            name="notes"
            rows="2"
            class="w-full resize-none rounded-md bg-bg px-2.5 py-2 text-sm text-text ring-1 ring-black/10 outline-none transition focus:ring-2 focus:ring-accent -outline-offset-1"
          />
        </div>

        <div
          v-if="status === 'error'"
          class="rounded-md bg-[var(--color-danger-bg)] px-2.5 py-2 text-xs text-[var(--color-danger-fg)] ring-1 ring-[var(--color-danger)]/15"
        >
          {{ errorMessage }}
        </div>

        <div
          v-if="status === 'saved'"
          class="flex items-center gap-2 rounded-md bg-[var(--color-success-bg,#e8f6ec)] px-2.5 py-2 text-xs text-[var(--color-success-fg,#1d6b3a)]"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none" aria-hidden="true">
            <path d="M2 6.5 5 9l5-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Saved to <span class="font-medium">{{ form.list }}</span>
        </div>

        <button
          type="submit"
          class="relative w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm shadow-black/5 transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="status === 'saving' || status === 'saved'"
        >
          {{ status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save bookmark' }}
        </button>
      </form>

      <!-- Plan-less user (no plan picked yet) -->
      <div v-else-if="status === 'error' && noPlan" class="space-y-3">
        <div class="rounded-md bg-[var(--color-danger-bg)] px-2.5 py-2 text-xs text-[var(--color-danger-fg)] ring-1 ring-[var(--color-danger)]/15">
          Finish setting up your account on stashsquirrel.com before saving from the extension.
        </div>
        <button
          type="button"
          class="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm shadow-black/5 transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          @click="openWebApp"
        >
          Open Stash Squirrel
        </button>
      </div>
    </div>

    <footer
      v-if="isConnected"
      class="flex items-center justify-between border-t border-black/5 px-4 py-2.5 text-xs"
    >
      <button
        type="button"
        class="text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
        @click="openWebApp"
      >
        Open dashboard
      </button>
      <button
        type="button"
        class="text-muted underline-offset-2 transition-colors hover:text-text hover:underline"
        @click="disconnect"
      >
        Disconnect
      </button>
    </footer>
  </main>
</template>
