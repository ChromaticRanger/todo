<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { authClient } from '../lib/auth-client'

interface Profile {
  id: string
  email: string
  name: string | null
  tier: string | null
  tierSource: string | null
  createdAt: string
}

const authStore = useAuthStore()

const profile = ref<Profile | null>(null)
const loadError = ref('')

const billingBusy = ref(false)
const billingError = ref('')

const showDelete = ref(false)
const confirmText = ref('')
const deleting = ref(false)
const deleteError = ref('')

function flashBillingError(msg: string) {
  billingError.value = msg
  setTimeout(() => (billingError.value = ''), 6000)
}

async function openBillingPortal() {
  billingBusy.value = true
  billingError.value = ''
  try {
    const client = authClient as unknown as {
      subscription: {
        billingPortal: (args: { returnUrl: string }) => Promise<{
          data?: { url?: string } | null
          error?: { message?: string } | null
        }>
      }
    }
    const { data, error } = await client.subscription.billingPortal({
      returnUrl: `${window.location.origin}/account`,
    })
    if (error) {
      flashBillingError(
        error.message ||
          "Couldn't open the billing portal. If this is a grandfathered account, there's no Stripe subscription yet."
      )
      return
    }
    if (data?.url) window.location.href = data.url
    else flashBillingError("Stripe didn't return a portal URL.")
  } catch (e) {
    flashBillingError(String(e))
  } finally {
    billingBusy.value = false
  }
}

async function upgradeTo(annual: boolean) {
  billingBusy.value = true
  billingError.value = ''
  try {
    const { error } = await authClient.subscription.upgrade({
      plan: 'pro',
      annual,
      successUrl: `${window.location.origin}/account?billing=success`,
      cancelUrl: `${window.location.origin}/account?billing=cancel`,
    })
    if (error) flashBillingError(error.message || "Couldn't start checkout.")
  } catch (e) {
    flashBillingError(String(e))
  } finally {
    billingBusy.value = false
  }
}

const canConfirmDelete = computed(() => confirmText.value.trim() === 'DELETE')

const createdAtDisplay = computed(() => {
  if (!profile.value) return ''
  const d = new Date(profile.value.createdAt)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
})

async function loadProfile() {
  loadError.value = ''
  try {
    const res = await apiFetch('/api/account')
    if (!res.ok) {
      loadError.value = `Couldn't load your account details (HTTP ${res.status}).`
      return
    }
    profile.value = (await res.json()) as Profile
  } catch (err) {
    loadError.value = String(err)
  }
}

function openDelete() {
  confirmText.value = ''
  deleteError.value = ''
  showDelete.value = true
}

function cancelDelete() {
  if (deleting.value) return
  showDelete.value = false
}

async function confirmDelete() {
  if (!canConfirmDelete.value || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  try {
    const res = await apiFetch('/api/account', { method: 'DELETE' })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      deleteError.value = body.error
        ? `Deletion failed: ${body.error}`
        : `Deletion failed (HTTP ${res.status}). Please try again.`
      deleting.value = false
      return
    }
    // Server has dropped the user row; cascades have killed sessions.
    // Sign out locally to clear the cached Better Auth state and send the
    // user back to the homepage.
    await authStore.logout().catch(() => {})
    window.location.href = '/'
  } catch (err) {
    deleteError.value = String(err)
    deleting.value = false
  }
}

function backToApp() {
  window.location.href = '/'
}

async function handleSignOut() {
  await authStore.logout()
  window.location.href = '/'
}

onMounted(loadProfile)
</script>

<template>
  <!-- Demo-mode placeholder: hide the full account UI (Sign out, Delete
       account, billing) from the shared demo session. -->
  <div v-if="authStore.isDemo" class="min-h-dvh bg-bg text-text p-6 antialiased">
    <div class="mx-auto max-w-xl">
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
      <h1 class="text-2xl font-semibold mb-1">Demo account</h1>
      <p class="text-sm text-muted mb-8">
        You're exploring with a temporary demo account. Sign up to manage
        your own.
      </p>
      <a
        href="/login?mode=signup"
        class="inline-block rounded-xl bg-accent px-5 py-3 text-base font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        Sign up — it's free
      </a>
    </div>
  </div>

  <div v-else class="min-h-dvh bg-bg text-text p-6 antialiased">
    <div class="mx-auto max-w-xl">
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

      <h1 class="text-2xl font-semibold mb-1">Account</h1>
      <p class="text-sm text-muted mb-8">Your profile and account controls.</p>

      <div v-if="loadError" class="rounded-lg bg-danger-bg ring-1 ring-danger/60 px-4 py-3 text-sm text-danger-fg mb-6">
        {{ loadError }}
      </div>

      <div v-if="profile" class="rounded-2xl bg-surface ring-1 ring-ring p-6 mb-6 dark:inset-ring dark:inset-ring-white/5">
        <h2 class="text-base font-semibold mb-4">Profile</h2>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
          <dt class="text-muted">Email</dt>
          <dd class="text-text">{{ profile.email }}</dd>

          <dt v-if="profile.name" class="text-muted">Name</dt>
          <dd v-if="profile.name" class="text-text">{{ profile.name }}</dd>

          <dt class="text-muted">Plan</dt>
          <dd>
            <span
              class="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              :class="profile.tier === 'pro'
                ? 'bg-accent/15 text-accent'
                : 'bg-muted/15 text-muted'"
            >
              {{ profile.tier ?? 'none' }}
            </span>
          </dd>

          <dt class="text-muted">Member since</dt>
          <dd class="text-text">{{ createdAtDisplay }}</dd>
        </dl>

        <button
          type="button"
          class="mt-6 inline-flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm text-text ring-1 ring-ring hover:bg-surface-hover"
          @click="handleSignOut"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>

      <div
        v-if="profile"
        class="rounded-2xl bg-surface ring-1 ring-ring p-6 mb-6 dark:inset-ring dark:inset-ring-white/5"
      >
        <h2 class="text-base font-semibold mb-1">Billing</h2>

        <template v-if="profile.tier === 'pro' && profile.tierSource === 'comp'">
          <p class="text-sm text-muted mb-4">
            You have a complementary Pro Plan Account, gifted by Martin. :-)
          </p>
        </template>

        <template v-else-if="profile.tier === 'pro'">
          <p class="text-sm text-muted mb-4">
            You're on the <span class="text-text font-medium">Pro</span> plan. Manage your
            subscription, view invoices, or cancel any time through the Stripe billing portal.
          </p>
          <button
            type="button"
            :disabled="billingBusy"
            class="inline-flex items-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm text-text ring-1 ring-ring hover:bg-surface-hover disabled:opacity-50"
            @click="openBillingPortal"
          >
            <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
            </svg>
            {{ billingBusy ? 'Opening…' : 'Manage subscription' }}
          </button>
        </template>

        <template v-else>
          <p class="text-sm text-muted mb-4">
            You're on the <span class="text-text font-medium">Free</span> plan. Upgrade to
            Pro for unlimited lists and items, the calendar, search across everything you've
            saved, the Discover view, and bookmark import.
          </p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              :disabled="billingBusy"
              class="rounded-lg bg-bg px-3 py-3 text-left ring-1 ring-ring hover:bg-surface-hover disabled:opacity-50"
              @click="upgradeTo(false)"
            >
              <div class="font-medium text-sm">Pro · Monthly</div>
              <div class="text-xs text-muted mt-0.5">£6 / month</div>
            </button>
            <button
              type="button"
              :disabled="billingBusy"
              class="rounded-lg bg-bg px-3 py-3 text-left ring-1 ring-ring hover:bg-surface-hover disabled:opacity-50"
              @click="upgradeTo(true)"
            >
              <div class="font-medium text-sm flex items-center gap-2">
                Pro · Yearly
                <span class="rounded-full bg-accent/15 text-accent text-[10px] font-semibold px-1.5 py-0.5">Save ~17%</span>
              </div>
              <div class="text-xs text-muted mt-0.5">£60 / year</div>
            </button>
          </div>
        </template>

        <div
          v-if="billingError"
          class="mt-4 rounded-lg bg-danger-bg ring-1 ring-danger/60 px-3 py-2 text-sm text-danger-fg"
        >
          {{ billingError }}
        </div>
      </div>

      <div class="rounded-2xl bg-surface ring-1 ring-danger/30 p-6 dark:inset-ring dark:inset-ring-white/5">
        <h2 class="text-base font-semibold mb-1 text-danger-fg">Danger zone</h2>
        <p class="text-sm text-muted mb-4">
          Deleting your account permanently removes your lists, todos, bookmarks, notes,
          and any other content you've saved. If you have a Pro subscription it will be
          cancelled. This cannot be undone.
        </p>
        <button
          type="button"
          class="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          @click="openDelete"
        >
          Delete account
        </button>
      </div>
    </div>

    <div
      v-if="showDelete"
      class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      @click.self="cancelDelete"
    >
      <div class="w-full max-w-md rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5">
        <h3 class="text-lg font-semibold mb-2">Delete your account?</h3>
        <p class="text-sm text-muted mb-4">
          This permanently removes <span class="text-text font-medium">{{ profile?.email }}</span>
          and everything you've saved in Stash Squirrel. Any active Pro subscription will be
          cancelled. There is no undo.
        </p>
        <p class="text-sm text-muted mb-2">Type <span class="font-mono font-semibold text-text">DELETE</span> to confirm:</p>
        <input
          v-model="confirmText"
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          class="w-full rounded-lg bg-bg px-3 py-2 text-sm text-text ring-1 ring-ring focus-visible:ring-2 focus-visible:ring-danger outline-none -outline-offset-1"
          placeholder="DELETE"
          :disabled="deleting"
          @keyup.enter="confirmDelete"
        />

        <div v-if="deleteError" class="mt-3 rounded-lg bg-danger-bg ring-1 ring-danger/60 px-3 py-2 text-sm text-danger-fg">
          {{ deleteError }}
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg bg-bg px-3 py-2 text-sm text-text ring-1 ring-ring hover:bg-surface-hover disabled:opacity-50"
            :disabled="deleting"
            @click="cancelDelete"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canConfirmDelete || deleting"
            @click="confirmDelete"
          >
            {{ deleting ? 'Deleting…' : 'Delete account' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
