<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { authClient } from '../lib/auth-client'

type Status = 'loading' | 'connected' | 'error'

const status = ref<Status>('loading')
const errorMessage = ref('')
const authStore = useAuthStore()

async function mintAndPost() {
  status.value = 'loading'
  errorMessage.value = ''
  try {
    const res = await apiFetch('/api/extension/token', { method: 'POST' })
    if (!res.ok) {
      errorMessage.value = `Couldn't issue a token (HTTP ${res.status}). Try signing in again.`
      status.value = 'error'
      return
    }
    const { token, expiresAt } = (await res.json()) as {
      token: string
      expiresAt: string | number
    }
    // The browser-extension content script (declared for this URL) listens for
    // this message and forwards the token to the extension's background worker.
    // origin is restricted so a third party can't read it via window.opener.
    window.postMessage(
      { type: 'stash-squirrel-token', token, expiresAt },
      window.location.origin
    )
    status.value = 'connected'
  } catch (err) {
    errorMessage.value = String(err)
    status.value = 'error'
  }
}

async function signOut() {
  await authClient.signOut().catch(() => {})
  // authStore.user clears, App.vue re-renders LoginPage.
}

onMounted(mintAndPost)
</script>

<template>
  <div class="min-h-dvh bg-bg flex items-center justify-center p-4 antialiased">
    <div class="w-full max-w-sm rounded-2xl bg-surface ring-1 ring-ring p-6 text-text">
      <h1 class="text-lg font-semibold mb-1">Connect Stash Squirrel</h1>
      <p class="text-sm text-muted mb-5">
        Linking your browser extension to
        <span class="text-text">{{ authStore.user?.email ?? 'your account' }}</span>.
      </p>

      <div v-if="status === 'loading'" class="flex items-center gap-2 text-sm text-muted">
        <span class="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
        Issuing token…
      </div>

      <div v-else-if="status === 'connected'" class="space-y-3">
        <div class="rounded-lg bg-bg ring-1 ring-ring p-3 text-sm">
          <p class="text-text font-medium">You're connected.</p>
          <p class="text-muted mt-1">
            You can close this tab. The extension popup will now let you save bookmarks.
          </p>
        </div>
        <button
          class="w-full rounded-lg bg-bg px-3 py-2 text-sm text-muted ring-1 ring-ring hover:bg-surface-hover transition-colors"
          @click="signOut"
        >
          Connect a different account
        </button>
      </div>

      <div v-else class="space-y-3">
        <div class="rounded-lg bg-bg ring-1 ring-ring p-3 text-sm text-text">
          {{ errorMessage || 'Something went wrong.' }}
        </div>
        <button
          class="w-full rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
          @click="mintAndPost"
        >
          Try again
        </button>
      </div>
    </div>
  </div>
</template>
