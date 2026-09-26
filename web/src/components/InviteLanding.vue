<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useCollabStore } from '../stores/collabStore'
import { stashPendingInvite } from '../lib/pendingInvite'

/**
 * The `/invite?token=…` landing page — the one surface an invited stranger sees
 * before they have an account, and the only place the growth loop can break in
 * a way that costs us the user.
 *
 * It resolves the token against an unauthenticated preview endpoint so the page
 * can say who invited them and to what. Asking someone to sign up for an
 * unnamed thing is the version that doesn't convert.
 *
 * The token is stashed in sessionStorage before we send anyone to sign in or
 * sign up, because the round trip through auth loses the URL. App.vue redeems it
 * once they come back authenticated. sessionStorage rather than localStorage so
 * an abandoned invite doesn't linger in the browser indefinitely.
 */

const authStore = useAuthStore()
const collab = useCollabStore()

interface Preview {
  list_name: string
  inviter_name: string
  role: 'viewer' | 'editor'
  email: string
  expires_at: string
  has_account: boolean
}

const token = ref('')
const preview = ref<Preview | null>(null)
const loadError = ref<'not_found' | 'invite_expired' | 'token_required' | 'failed' | ''>('')
const loading = ref(true)
const busy = ref(false)
const accepted = ref(false)
const declined = ref(false)

// A demo visitor is technically signed in, but as an ephemeral throwaway user —
// joining a real person's list as one would be a dead end, so they're treated
// as a stranger who needs an account.
const signedIn = computed(() => authStore.isAuthenticated && !authStore.isDemo)

const roleLabel = computed(() =>
  preview.value?.role === 'editor' ? 'add and edit items' : 'view items'
)

onMounted(async () => {
  if (typeof window !== 'undefined') {
    token.value = new URLSearchParams(window.location.search).get('token') ?? ''
  }
  if (!token.value) {
    loadError.value = 'token_required'
    loading.value = false
    return
  }
  try {
    const res = await fetch(
      `/api/collab/invites/preview?token=${encodeURIComponent(token.value)}`
    )
    if (res.ok) {
      preview.value = (await res.json()) as Preview
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      loadError.value =
        body.error === 'invite_expired' ? 'invite_expired' : 'not_found'
    }
  } catch {
    loadError.value = 'failed'
  } finally {
    loading.value = false
  }
})

function stashAndGo(path: string) {
  stashPendingInvite(token.value)
  window.location.href = path
}

async function accept() {
  busy.value = true
  const ok = await collab.acceptToken(token.value)
  busy.value = false
  if (ok) accepted.value = true
}

function decline() {
  // Declining without an account is just walking away; there's nothing to
  // record against, and the invite expires on its own.
  declined.value = true
}
</script>

<template>
  <div class="min-h-dvh bg-bg flex items-center justify-center p-4 antialiased">
    <div class="w-full max-w-xs">
      <div class="flex flex-col items-center gap-2 mb-8">
        <img src="/stash-squirrel.svg" alt="Stash Squirrel" class="size-20" />
        <h1
          class="font-display italic text-3xl font-semibold tracking-tight bg-gradient-to-br from-[#e53b30] via-[#c92c24] to-[#8b2a1f] bg-clip-text text-transparent pr-2"
        >
          Stash Squirrel
        </h1>
      </div>

      <div
        class="rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5"
      >
        <!-- Resolving the token -->
        <div v-if="loading" class="flex flex-col items-center gap-3 text-center">
          <div class="size-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          <p class="text-sm text-muted">Checking your invitation…</p>
        </div>

        <!-- Accepted -->
        <div v-else-if="accepted" class="flex flex-col items-center text-center gap-3">
          <div class="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 class="text-base font-semibold text-text">You're in</h2>
          <p class="text-sm text-muted text-balance">
            <strong class="font-medium text-text">{{ preview?.list_name }}</strong>
            is now in your lists, alongside your own.
          </p>
          <a
            href="/"
            class="mt-2 flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Open the list
          </a>
        </div>

        <!-- Declined -->
        <div v-else-if="declined" class="flex flex-col items-center text-center gap-3">
          <h2 class="text-base font-semibold text-text">Invitation declined</h2>
          <p class="text-sm text-muted text-balance">
            No problem — nothing has been shared with you.
          </p>
          <a
            href="/"
            class="mt-2 flex w-full items-center justify-center rounded-lg bg-surface px-3 py-2 text-sm font-medium text-text ring-1 ring-ring transition-colors hover:bg-bg"
          >
            Go to Stash Squirrel
          </a>
        </div>

        <!-- Bad, revoked, already-used or expired link -->
        <div v-else-if="loadError" class="flex flex-col items-center text-center gap-3">
          <div class="flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger-fg">
            <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-base font-semibold text-text">
            {{ loadError === 'invite_expired' ? 'This invitation has expired' : 'This link isn\'t valid' }}
          </h2>
          <p class="text-sm text-muted text-balance">
            {{
              loadError === 'invite_expired'
                ? 'Invitations last 14 days. Ask for a fresh one and you\'ll get a new link.'
                : 'It may have been withdrawn, already used, or replaced by a newer invitation. Ask for a fresh one.'
            }}
          </p>
          <a
            href="/"
            class="mt-2 flex w-full items-center justify-center rounded-lg bg-surface px-3 py-2 text-sm font-medium text-text ring-1 ring-ring transition-colors hover:bg-bg"
          >
            Go to Stash Squirrel
          </a>
        </div>

        <!-- A live invitation -->
        <div v-else-if="preview">
          <div class="flex flex-col items-center text-center gap-3">
            <div class="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
                class="size-6" aria-hidden="true"
              >
                <path d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
            <h2 class="text-base font-semibold text-text text-balance">
              {{ preview.inviter_name }} shared a list with you
            </h2>
            <p class="text-sm text-muted text-balance">
              You've been invited to
              <strong class="font-medium text-text">{{ preview.list_name }}</strong>
              and can {{ roleLabel }}.
            </p>
          </div>

          <p v-if="collab.error" class="mt-4 text-sm text-danger-fg text-center text-balance">
            {{ collab.error }}
          </p>

          <!-- Signed in: act on it now -->
          <div v-if="signedIn" class="mt-5 space-y-2">
            <button
              type="button"
              :disabled="busy"
              class="flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
              @click="accept"
            >
              {{ busy ? 'Joining…' : 'Accept invitation' }}
            </button>
            <button
              type="button"
              :disabled="busy"
              class="flex w-full items-center justify-center rounded-lg bg-surface px-3 py-2 text-sm font-medium text-muted ring-1 ring-ring transition-colors hover:bg-bg disabled:opacity-60"
              @click="decline"
            >
              Decline
            </button>
          </div>

          <!-- Has an account but isn't signed in here -->
          <div v-else-if="preview.has_account" class="mt-5 space-y-3">
            <button
              type="button"
              class="flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
              @click="stashAndGo('/login')"
            >
              Sign in to accept
            </button>
            <p class="text-xs text-muted text-center text-balance">
              Sign in as {{ preview.email }} and we'll add the list straight away.
            </p>
          </div>

          <!-- No account yet: this is the growth path -->
          <div v-else class="mt-5 space-y-3">
            <button
              type="button"
              class="flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
              @click="stashAndGo('/login?mode=signup')"
            >
              Create an account to join
            </button>
            <p class="text-xs text-muted text-center text-balance">
              It's free, and {{ preview.list_name }} will be waiting for you. Use
              {{ preview.email }} and it'll be added automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
