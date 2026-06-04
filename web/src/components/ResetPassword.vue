<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { authClient } from '../lib/auth-client'

// Better Auth's GET /api/auth/reset-password/:token validates the token and
// redirects here with either `?token=…` (valid) or `?error=INVALID_TOKEN`
// (expired/used/bad). Read both off the URL once on mount — no router today.
const token = ref('')
const linkError = ref('')

onMounted(() => {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  token.value = params.get('token') ?? ''
  linkError.value = params.get('error') ?? ''
})

const password = ref('')
const confirm = ref('')
const error = ref('')
const loading = ref(false)
const done = ref(false)

// The link is unusable if Better Auth bounced back an error or no token landed.
const linkInvalid = computed(() => !!linkError.value || !token.value)

async function handleSubmit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match.'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  loading.value = true
  try {
    const { error: err } = await authClient.resetPassword({
      newPassword: password.value,
      token: token.value,
    })
    if (err) {
      // A token that expires between the redirect and submit surfaces here.
      error.value = err.message || 'Could not reset your password. The link may have expired.'
    } else {
      done.value = true
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-bg flex items-center justify-center p-4 antialiased">
    <div class="w-full max-w-xs">
      <!-- Branding -->
      <div class="flex flex-col items-center gap-2 mb-8">
        <img src="/stash-squirrel.svg" alt="Stash Squirrel" class="size-20" />
        <h1
          class="font-display italic text-3xl font-semibold tracking-tight bg-gradient-to-br from-[#e53b30] via-[#c92c24] to-[#8b2a1f] bg-clip-text text-transparent pr-2"
        >
          Stash Squirrel
        </h1>
      </div>

      <!-- Success -->
      <div v-if="done" class="rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5">
        <div class="flex flex-col items-center text-center gap-3">
          <div class="flex size-12 items-center justify-center rounded-full bg-accent/15 text-accent">
            <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 class="text-base font-semibold text-text">Password updated</h2>
          <p class="text-sm text-muted text-balance">
            Your password has been changed. You can now sign in with your new password.
          </p>
          <a
            href="/login"
            class="mt-2 flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Continue to sign in
          </a>
        </div>
      </div>

      <!-- Invalid / expired link -->
      <div v-else-if="linkInvalid" class="rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5">
        <div class="flex flex-col items-center text-center gap-3">
          <div class="flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger-fg">
            <svg class="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-base font-semibold text-text">Link expired or invalid</h2>
          <p class="text-sm text-muted text-balance">
            This password reset link is no longer valid. Request a fresh one and we'll email you a new link.
          </p>
          <a
            href="/login?reset=1"
            class="mt-2 flex w-full items-center justify-center rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Request a new link
          </a>
        </div>
      </div>

      <!-- Set new password -->
      <div v-else class="rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5">
        <h2 class="text-base font-semibold text-text mb-1">Choose a new password</h2>
        <p class="text-sm text-muted mb-4">Enter a new password for your account.</p>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <label for="new-password" class="text-sm font-medium text-muted">New password</label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autocomplete="new-password"
              v-model="password"
              required
              minlength="8"
              class="rounded-lg bg-bg px-3 py-2 text-sm text-text placeholder-muted ring-1 ring-ring outline-none focus-visible:ring-2 focus-visible:ring-accent -outline-offset-1 max-sm:text-base/6"
              placeholder="At least 8 characters"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="confirm-password" class="text-sm font-medium text-muted">Confirm password</label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autocomplete="new-password"
              v-model="confirm"
              required
              minlength="8"
              class="rounded-lg bg-bg px-3 py-2 text-sm text-text placeholder-muted ring-1 ring-ring outline-none focus-visible:ring-2 focus-visible:ring-accent -outline-offset-1 max-sm:text-base/6"
              placeholder="Re-enter your password"
            />
          </div>

          <div v-if="error" class="rounded-lg bg-danger-bg px-3 py-2 ring-1 ring-danger/60">
            <p class="text-sm text-danger-fg">{{ error }}</p>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg v-if="loading" class="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ loading ? 'Updating…' : 'Update password' }}
          </button>
        </form>
      </div>

      <p class="mt-6 text-center text-xs text-muted">
        <a href="/login" class="hover:text-text transition-colors">← Back to sign in</a>
      </p>
    </div>
  </div>
</template>
