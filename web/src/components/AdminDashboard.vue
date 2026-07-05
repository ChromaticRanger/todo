<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { apiFetch } from '../lib/api'

interface Stats {
  total: number
  free: number
  pro: number
  none: number
  newLast7Days: number
  newLast30Days: number
  comp: number
}

interface UserRow {
  id: string
  email: string
  name: string | null
  tier: string | null
  tierSource: string | null
  createdAt: string
  emailVerified: boolean
  todoCount: number
  hasSubscription: boolean
}

interface UserDetail {
  user: {
    id: string
    email: string
    name: string | null
    tier: string | null
    tierSource: string | null
    createdAt: string
    updatedAt: string
    emailVerified: boolean
    image: string | null
  }
  subscription: {
    stripeSubscriptionId: string | null
    stripeCustomerId: string | null
    status: string | null
    plan: string | null
    periodEnd: string | null
  } | null
  counts: {
    todos: number
    bookmarks: number
    notes: number
    lists: number
    categories: number
  }
  lastSessionAt: string | null
}

const stats = ref<Stats | null>(null)
const statsError = ref('')

const users = ref<UserRow[]>([])
const total = ref(0)
const loadingUsers = ref(false)
const usersError = ref('')
const accessDenied = ref(false)

const search = ref('')
const tierFilter = ref<'' | 'free' | 'pro' | 'none'>('')
const page = ref(0)
const pageSize = 50

const selectedUser = ref<UserDetail | null>(null)
const selectedLoading = ref(false)
const selectedError = ref('')

const togglingId = ref<string | null>(null)
const toggleError = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

async function loadStats() {
  statsError.value = ''
  try {
    const res = await apiFetch('/api/admin/stats')
    if (res.status === 403) {
      accessDenied.value = true
      return
    }
    if (!res.ok) {
      statsError.value = `Stats failed (HTTP ${res.status}).`
      return
    }
    stats.value = (await res.json()) as Stats
  } catch (e) {
    statsError.value = String(e)
  }
}

let usersReqId = 0
async function loadUsers() {
  loadingUsers.value = true
  usersError.value = ''
  const reqId = ++usersReqId
  try {
    const params = new URLSearchParams()
    if (search.value.trim()) params.set('q', search.value.trim())
    if (tierFilter.value) params.set('tier', tierFilter.value)
    params.set('limit', String(pageSize))
    params.set('offset', String(page.value * pageSize))

    const res = await apiFetch(`/api/admin/users?${params.toString()}`)
    if (reqId !== usersReqId) return
    if (res.status === 403) {
      accessDenied.value = true
      return
    }
    if (!res.ok) {
      usersError.value = `Users failed (HTTP ${res.status}).`
      return
    }
    const body = (await res.json()) as { users: UserRow[]; total: number }
    users.value = body.users
    total.value = body.total
  } catch (e) {
    if (reqId === usersReqId) usersError.value = String(e)
  } finally {
    if (reqId === usersReqId) loadingUsers.value = false
  }
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    page.value = 0
    loadUsers()
  }, 250)
})

watch(tierFilter, () => {
  page.value = 0
  loadUsers()
})

watch(page, () => {
  loadUsers()
})

async function openDetail(u: UserRow) {
  selectedUser.value = null
  selectedError.value = ''
  selectedLoading.value = true
  try {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(u.id)}`)
    if (!res.ok) {
      selectedError.value = `Couldn't load user (HTTP ${res.status}).`
      return
    }
    selectedUser.value = (await res.json()) as UserDetail
  } catch (e) {
    selectedError.value = String(e)
  } finally {
    selectedLoading.value = false
  }
}

function closeDetail() {
  selectedUser.value = null
  selectedError.value = ''
}

async function toggleTier(u: UserRow | UserDetail['user'], nextTier: 'free' | 'pro') {
  togglingId.value = u.id
  toggleError.value = ''
  try {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(u.id)}/tier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: nextTier }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      toggleError.value = body.message || body.error || `Toggle failed (HTTP ${res.status}).`
      return
    }
    // Update in-place so we don't have to wait for a refetch.
    const row = users.value.find((r) => r.id === u.id)
    if (row) {
      row.tier = nextTier
      row.tierSource = 'comp'
    }
    if (selectedUser.value && selectedUser.value.user.id === u.id) {
      selectedUser.value.user.tier = nextTier
      selectedUser.value.user.tierSource = 'comp'
    }
    loadStats()
  } catch (e) {
    toggleError.value = String(e)
  } finally {
    togglingId.value = null
  }
}

// ---- Blog management ----
interface BlogPost {
  id: number
  slug: string
  title: string
  summary: string
  is_published: boolean
  published_at: string | null
  updated_at: string
}

const blogPosts = ref<BlogPost[]>([])
const blogError = ref('')
const blogLoading = ref(false)
const uploading = ref(false)
const uploadMsg = ref('')
const blogFileInput = ref<HTMLInputElement | null>(null)
const blogBusyId = ref<number | null>(null)

async function loadBlog() {
  blogLoading.value = true
  blogError.value = ''
  try {
    const res = await apiFetch('/api/admin/blog')
    if (res.status === 403) {
      accessDenied.value = true
      return
    }
    if (!res.ok) {
      blogError.value = `Blog list failed (HTTP ${res.status}).`
      return
    }
    blogPosts.value = ((await res.json()) as { posts: BlogPost[] }).posts
  } catch (e) {
    blogError.value = String(e)
  } finally {
    blogLoading.value = false
  }
}

async function onBlogFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  uploadMsg.value = ''
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await apiFetch('/api/admin/blog', { method: 'POST', body: form })
    const body = (await res.json().catch(() => ({}))) as {
      post?: BlogPost
      message?: string
      error?: string
    }
    if (!res.ok) {
      uploadMsg.value = `⚠️ ${body.message || body.error || `Upload failed (HTTP ${res.status}).`}`
      return
    }
    uploadMsg.value = body.post
      ? `✓ Saved "${body.post.title}" (${body.post.is_published ? 'published' : 'draft'}).`
      : '✓ Saved.'
    await loadBlog()
  } catch (e) {
    uploadMsg.value = `⚠️ ${String(e)}`
  } finally {
    uploading.value = false
    if (blogFileInput.value) blogFileInput.value.value = ''
  }
}

async function togglePublish(post: BlogPost) {
  blogBusyId.value = post.id
  blogError.value = ''
  try {
    const res = await apiFetch(`/api/admin/blog/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_published: !post.is_published }),
    })
    if (!res.ok) {
      blogError.value = `Publish toggle failed (HTTP ${res.status}).`
      return
    }
    const updated = ((await res.json()) as { post: BlogPost }).post
    Object.assign(post, updated)
  } catch (e) {
    blogError.value = String(e)
  } finally {
    blogBusyId.value = null
  }
}

async function deletePost(post: BlogPost) {
  if (!window.confirm(`Delete "${post.title}"? This can't be undone.`)) return
  blogBusyId.value = post.id
  blogError.value = ''
  try {
    const res = await apiFetch(`/api/admin/blog/${post.id}`, { method: 'DELETE' })
    if (!res.ok) {
      blogError.value = `Delete failed (HTTP ${res.status}).`
      return
    }
    blogPosts.value = blogPosts.value.filter((p) => p.id !== post.id)
  } catch (e) {
    blogError.value = String(e)
  } finally {
    blogBusyId.value = null
  }
}

function backToApp() {
  window.location.href = '/'
}

function nextPage() {
  if (page.value + 1 < totalPages.value) page.value += 1
}
function prevPage() {
  if (page.value > 0) page.value -= 1
}

onMounted(() => {
  loadStats()
  loadUsers()
  loadBlog()
})
</script>

<template>
  <div class="min-h-dvh bg-bg text-text p-6 antialiased">
    <div class="mx-auto max-w-6xl">
      <button
        type="button"
        class="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text"
        @click="backToApp"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Stash Squirrel
      </button>

      <h1 class="text-2xl font-semibold mb-1">Admin</h1>
      <p class="text-sm text-muted mb-8">User management and system overview.</p>

      <div
        v-if="accessDenied"
        class="rounded-2xl bg-surface ring-1 ring-danger/40 p-6 dark:inset-ring dark:inset-ring-white/5"
      >
        <h2 class="text-base font-semibold text-danger-fg mb-1">Not authorized</h2>
        <p class="text-sm text-muted">
          This account isn't in the <code class="font-mono text-text">ADMIN_EMAILS</code> allowlist.
        </p>
      </div>

      <template v-else>
        <!-- Stats -->
        <div v-if="statsError" class="mb-4 rounded-lg bg-danger-bg ring-1 ring-danger/60 px-3 py-2 text-sm text-danger-fg">
          {{ statsError }}
        </div>

        <div v-if="stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div class="rounded-2xl bg-surface ring-1 ring-ring p-4 dark:inset-ring dark:inset-ring-white/5">
            <div class="text-xs text-muted uppercase tracking-wide">Total users</div>
            <div class="text-2xl font-semibold mt-1">{{ stats.total }}</div>
          </div>
          <div class="rounded-2xl bg-surface ring-1 ring-ring p-4 dark:inset-ring dark:inset-ring-white/5">
            <div class="text-xs text-muted uppercase tracking-wide">Pro</div>
            <div class="text-2xl font-semibold mt-1 text-accent">{{ stats.pro }}</div>
            <div class="text-xs text-muted mt-1">{{ stats.comp }} comped</div>
          </div>
          <div class="rounded-2xl bg-surface ring-1 ring-ring p-4 dark:inset-ring dark:inset-ring-white/5">
            <div class="text-xs text-muted uppercase tracking-wide">Free</div>
            <div class="text-2xl font-semibold mt-1">{{ stats.free }}</div>
            <div v-if="stats.none > 0" class="text-xs text-muted mt-1">{{ stats.none }} no plan yet</div>
          </div>
          <div class="rounded-2xl bg-surface ring-1 ring-ring p-4 dark:inset-ring dark:inset-ring-white/5">
            <div class="text-xs text-muted uppercase tracking-wide">New (7d / 30d)</div>
            <div class="text-2xl font-semibold mt-1">{{ stats.newLast7Days }} / {{ stats.newLast30Days }}</div>
          </div>
        </div>

        <!-- Users -->
        <div class="rounded-2xl bg-surface ring-1 ring-ring p-6 mb-6 dark:inset-ring dark:inset-ring-white/5">
          <div class="flex flex-wrap items-center gap-3 mb-4">
            <h2 class="text-base font-semibold mr-auto">Users</h2>
            <input
              v-model="search"
              type="search"
              placeholder="Search email or name"
              class="rounded-lg bg-bg px-3 py-1.5 text-sm text-text ring-1 ring-ring focus-visible:ring-2 focus-visible:ring-accent outline-none -outline-offset-1 w-64"
            />
            <select
              v-model="tierFilter"
              class="rounded-lg bg-bg px-3 py-1.5 text-sm text-text ring-1 ring-ring focus-visible:ring-2 focus-visible:ring-accent outline-none -outline-offset-1"
            >
              <option value="">All tiers</option>
              <option value="pro">Pro</option>
              <option value="free">Free</option>
              <option value="none">No plan yet</option>
            </select>
          </div>

          <div v-if="toggleError" class="mb-3 rounded-lg bg-danger-bg ring-1 ring-danger/60 px-3 py-2 text-sm text-danger-fg">
            {{ toggleError }}
          </div>
          <div v-if="usersError" class="mb-3 rounded-lg bg-danger-bg ring-1 ring-danger/60 px-3 py-2 text-sm text-danger-fg">
            {{ usersError }}
          </div>

          <div class="overflow-x-auto -mx-2">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide text-muted">
                  <th class="font-medium px-2 py-2">Email</th>
                  <th class="font-medium px-2 py-2">Name</th>
                  <th class="font-medium px-2 py-2">Tier</th>
                  <th class="font-medium px-2 py-2">Source</th>
                  <th class="font-medium px-2 py-2">Signed up</th>
                  <th class="font-medium px-2 py-2 text-right">Items</th>
                  <th class="font-medium px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loadingUsers && users.length === 0">
                  <td colspan="7" class="px-2 py-6 text-center text-muted">Loading…</td>
                </tr>
                <tr v-else-if="users.length === 0">
                  <td colspan="7" class="px-2 py-6 text-center text-muted">No users match.</td>
                </tr>
                <tr
                  v-for="u in users"
                  :key="u.id"
                  class="border-t border-border/60 hover:bg-surface-hover cursor-pointer"
                  @click="openDetail(u)"
                >
                  <td class="px-2 py-2 font-medium text-text">{{ u.email }}</td>
                  <td class="px-2 py-2 text-muted">{{ u.name || '—' }}</td>
                  <td class="px-2 py-2">
                    <span
                      class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      :class="u.tier === 'pro'
                        ? 'bg-accent/15 text-accent'
                        : u.tier === 'free'
                          ? 'bg-muted/15 text-muted'
                          : 'bg-muted/10 text-muted/70'"
                    >
                      {{ u.tier ?? 'none' }}
                    </span>
                  </td>
                  <td class="px-2 py-2 text-xs text-muted">
                    <span v-if="u.tierSource === 'comp'" class="text-accent">comp</span>
                    <span v-else-if="u.tierSource === 'stripe'">stripe</span>
                    <span v-else>—</span>
                    <span v-if="u.hasSubscription" class="ml-1 text-[10px] uppercase tracking-wide">·sub</span>
                  </td>
                  <td class="px-2 py-2 text-muted">{{ fmtDate(u.createdAt) }}</td>
                  <td class="px-2 py-2 text-muted text-right tabular-nums">{{ u.todoCount }}</td>
                  <td class="px-2 py-2 text-right">
                    <button
                      v-if="u.tier !== 'pro'"
                      type="button"
                      class="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                      :disabled="togglingId === u.id || u.hasSubscription"
                      :title="u.hasSubscription ? 'User has a Stripe subscription' : ''"
                      @click.stop="toggleTier(u, 'pro')"
                    >
                      {{ togglingId === u.id ? '…' : 'Make Pro' }}
                    </button>
                    <button
                      v-else
                      type="button"
                      class="rounded-lg bg-bg px-2.5 py-1 text-xs font-medium text-text ring-1 ring-ring hover:bg-surface-hover disabled:opacity-50"
                      :disabled="togglingId === u.id || u.hasSubscription"
                      :title="u.hasSubscription ? 'User has a Stripe subscription' : ''"
                      @click.stop="toggleTier(u, 'free')"
                    >
                      {{ togglingId === u.id ? '…' : 'Revoke Pro' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="mt-4 flex items-center justify-between text-xs text-muted">
            <span>
              Showing
              {{ users.length === 0 ? 0 : page * pageSize + 1 }}–{{ page * pageSize + users.length }}
              of {{ total }}
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-lg bg-bg px-2.5 py-1 ring-1 ring-ring hover:bg-surface-hover disabled:opacity-40"
                :disabled="page === 0 || loadingUsers"
                @click="prevPage"
              >
                Prev
              </button>
              <span>Page {{ page + 1 }} / {{ totalPages }}</span>
              <button
                type="button"
                class="rounded-lg bg-bg px-2.5 py-1 ring-1 ring-ring hover:bg-surface-hover disabled:opacity-40"
                :disabled="page + 1 >= totalPages || loadingUsers"
                @click="nextPage"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <!-- Blog -->
        <div class="rounded-2xl bg-surface ring-1 ring-ring p-6 mb-6 dark:inset-ring dark:inset-ring-white/5">
          <div class="flex flex-wrap items-center gap-3 mb-2">
            <h2 class="text-base font-semibold mr-auto">Blog</h2>
            <label
              class="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover cursor-pointer"
              :class="{ 'opacity-50 pointer-events-none': uploading }"
            >
              <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V3m0 0L8 7m4-4l4 4" />
              </svg>
              {{ uploading ? 'Uploading…' : 'Upload .md' }}
              <input
                ref="blogFileInput"
                type="file"
                accept=".md,.markdown,text/markdown"
                class="hidden"
                :disabled="uploading"
                @change="onBlogFile"
              />
            </label>
          </div>
          <p class="text-xs text-muted mb-4">
            Upload a Markdown file with a front-matter block
            (<code class="font-mono text-text">title</code>,
            <code class="font-mono text-text">slug</code>,
            <code class="font-mono text-text">summary</code>,
            <code class="font-mono text-text">published</code>).
            Re-uploading the same slug edits the post.
          </p>

          <div v-if="uploadMsg" class="mb-3 rounded-lg bg-bg ring-1 ring-ring px-3 py-2 text-sm text-text">
            {{ uploadMsg }}
          </div>
          <div v-if="blogError" class="mb-3 rounded-lg bg-danger-bg ring-1 ring-danger/60 px-3 py-2 text-sm text-danger-fg">
            {{ blogError }}
          </div>

          <div class="overflow-x-auto -mx-2">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide text-muted">
                  <th class="font-medium px-2 py-2">Title</th>
                  <th class="font-medium px-2 py-2">Slug</th>
                  <th class="font-medium px-2 py-2">Status</th>
                  <th class="font-medium px-2 py-2">Updated</th>
                  <th class="font-medium px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="blogLoading && blogPosts.length === 0">
                  <td colspan="5" class="px-2 py-6 text-center text-muted">Loading…</td>
                </tr>
                <tr v-else-if="blogPosts.length === 0">
                  <td colspan="5" class="px-2 py-6 text-center text-muted">No posts yet. Upload one to get started.</td>
                </tr>
                <tr v-for="post in blogPosts" :key="post.id" class="border-t border-border/60">
                  <td class="px-2 py-2 font-medium text-text">{{ post.title }}</td>
                  <td class="px-2 py-2 font-mono text-xs text-muted">{{ post.slug }}</td>
                  <td class="px-2 py-2">
                    <span
                      class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      :class="post.is_published ? 'bg-accent/15 text-accent' : 'bg-muted/15 text-muted'"
                    >
                      {{ post.is_published ? 'Published' : 'Draft' }}
                    </span>
                  </td>
                  <td class="px-2 py-2 text-muted">{{ fmtDate(post.updated_at) }}</td>
                  <td class="px-2 py-2 text-right whitespace-nowrap">
                    <a
                      :href="`/blog/${post.slug}`"
                      class="inline-block rounded-lg bg-bg px-2.5 py-1 text-xs font-medium text-text ring-1 ring-ring hover:bg-surface-hover mr-1"
                    >View</a>
                    <button
                      type="button"
                      class="rounded-lg bg-bg px-2.5 py-1 text-xs font-medium text-text ring-1 ring-ring hover:bg-surface-hover disabled:opacity-50 mr-1"
                      :disabled="blogBusyId === post.id"
                      @click="togglePublish(post)"
                    >
                      {{ blogBusyId === post.id ? '…' : post.is_published ? 'Unpublish' : 'Publish' }}
                    </button>
                    <button
                      type="button"
                      class="rounded-lg bg-bg px-2.5 py-1 text-xs font-medium text-danger-fg ring-1 ring-danger/40 hover:bg-danger-bg disabled:opacity-50"
                      :disabled="blogBusyId === post.id"
                      @click="deletePost(post)"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>

    <!-- User detail modal -->
    <div
      v-if="selectedUser || selectedLoading || selectedError"
      class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      @click.self="closeDetail"
    >
      <div class="w-full max-w-lg rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5">
        <div class="flex items-start justify-between gap-4 mb-4">
          <h3 class="text-lg font-semibold">User detail</h3>
          <button
            type="button"
            class="text-muted hover:text-text"
            aria-label="Close"
            @click="closeDetail"
          >
            <svg class="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div v-if="selectedLoading" class="text-sm text-muted">Loading…</div>
        <div v-else-if="selectedError" class="rounded-lg bg-danger-bg ring-1 ring-danger/60 px-3 py-2 text-sm text-danger-fg">
          {{ selectedError }}
        </div>

        <template v-else-if="selectedUser">
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt class="text-muted">Email</dt>
            <dd class="text-text break-all">{{ selectedUser.user.email }}</dd>

            <dt v-if="selectedUser.user.name" class="text-muted">Name</dt>
            <dd v-if="selectedUser.user.name" class="text-text">{{ selectedUser.user.name }}</dd>

            <dt class="text-muted">User ID</dt>
            <dd class="font-mono text-xs text-text break-all">{{ selectedUser.user.id }}</dd>

            <dt class="text-muted">Tier</dt>
            <dd>
              <span
                class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                :class="selectedUser.user.tier === 'pro'
                  ? 'bg-accent/15 text-accent'
                  : 'bg-muted/15 text-muted'"
              >
                {{ selectedUser.user.tier ?? 'none' }}
              </span>
              <span v-if="selectedUser.user.tierSource" class="ml-2 text-xs text-muted">
                via {{ selectedUser.user.tierSource }}
              </span>
            </dd>

            <dt class="text-muted">Email verified</dt>
            <dd class="text-text">{{ selectedUser.user.emailVerified ? 'Yes' : 'No' }}</dd>

            <dt class="text-muted">Created</dt>
            <dd class="text-text">{{ fmtDateTime(selectedUser.user.createdAt) }}</dd>

            <dt class="text-muted">Last session</dt>
            <dd class="text-text">{{ fmtDateTime(selectedUser.lastSessionAt) }}</dd>

            <dt class="text-muted">Counts</dt>
            <dd class="text-text">
              {{ selectedUser.counts.todos }} todos ·
              {{ selectedUser.counts.bookmarks }} bookmarks ·
              {{ selectedUser.counts.notes }} notes
              <div class="text-xs text-muted">
                {{ selectedUser.counts.lists }} lists · {{ selectedUser.counts.categories }} categories
              </div>
            </dd>

            <template v-if="selectedUser.subscription">
              <dt class="text-muted">Stripe</dt>
              <dd class="text-text">
                <div>Status: {{ selectedUser.subscription.status ?? '—' }}</div>
                <div v-if="selectedUser.subscription.plan" class="text-xs text-muted">
                  Plan: {{ selectedUser.subscription.plan }}
                </div>
                <div v-if="selectedUser.subscription.periodEnd" class="text-xs text-muted">
                  Period ends: {{ fmtDateTime(selectedUser.subscription.periodEnd) }}
                </div>
                <div v-if="selectedUser.subscription.stripeCustomerId" class="font-mono text-xs text-muted break-all">
                  cust: {{ selectedUser.subscription.stripeCustomerId }}
                </div>
              </dd>
            </template>
          </dl>

          <div class="mt-5 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg bg-bg px-3 py-2 text-sm text-text ring-1 ring-ring hover:bg-surface-hover"
              @click="closeDetail"
            >
              Close
            </button>
            <button
              v-if="selectedUser.user.tier !== 'pro'"
              type="button"
              class="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
              :disabled="togglingId === selectedUser.user.id || !!selectedUser.subscription"
              :title="selectedUser.subscription ? 'User has a Stripe subscription' : ''"
              @click="toggleTier(selectedUser.user, 'pro')"
            >
              {{ togglingId === selectedUser.user.id ? 'Updating…' : 'Make Pro' }}
            </button>
            <button
              v-else
              type="button"
              class="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              :disabled="togglingId === selectedUser.user.id || !!selectedUser.subscription"
              :title="selectedUser.subscription ? 'User has a Stripe subscription' : ''"
              @click="toggleTier(selectedUser.user, 'free')"
            >
              {{ togglingId === selectedUser.user.id ? 'Updating…' : 'Revoke Pro' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>
