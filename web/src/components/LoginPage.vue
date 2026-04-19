<script setup lang="ts">
import { ref, computed } from 'vue'
import { authClient } from '../lib/auth-client'

type Mode = 'signin' | 'signup'

const mode = ref<Mode>('signin')
const email = ref('')
const password = ref('')
const name = ref('')
const error = ref('')
const loading = ref(false)

const title = computed(() => (mode.value === 'signin' ? 'Sign in' : 'Create account'))
const submitLabel = computed(() => (mode.value === 'signin' ? 'Sign in' : 'Sign up'))

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'signup') {
      const { error: err } = await authClient.signUp.email({
        email: email.value,
        password: password.value,
        name: name.value || email.value,
      })
      if (err) {
        error.value = err.message || 'Sign up failed'
      }
    } else {
      const { error: err } = await authClient.signIn.email({
        email: email.value,
        password: password.value,
      })
      if (err) {
        error.value = err.message || 'Invalid credentials'
      }
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    loading.value = false
  }
}

async function signInWithGoogle() {
  error.value = ''
  try {
    await authClient.signIn.social({ provider: 'google', callbackURL: window.location.origin })
  } catch (e) {
    error.value = String(e)
  }
}

async function signInWithGitHub() {
  error.value = ''
  try {
    await authClient.signIn.social({ provider: 'github', callbackURL: window.location.origin })
  } catch (e) {
    error.value = String(e)
  }
}

function toggleMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin'
  error.value = ''
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
        <p class="text-sm text-muted text-center text-balance">
          A nest for your todos, bookmarks, and notes.
        </p>
      </div>

      <!-- Auth card -->
      <div class="rounded-2xl bg-surface ring-1 ring-ring p-6 dark:inset-ring dark:inset-ring-white/5">
        <h2 class="text-base font-semibold text-text mb-4">{{ title }}</h2>

        <!-- Social providers -->
        <div class="flex flex-col gap-2 mb-5">
          <button
            type="button"
            @click="signInWithGoogle"
            class="flex items-center justify-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm font-medium text-text ring-1 ring-ring transition-colors hover:bg-surface-hover"
          >
            <svg class="size-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
              <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.67-2.26 1.07-3.71 1.07-2.85 0-5.27-1.93-6.13-4.52H2.18v2.84A11 11 0 0 0 12 23z"/>
              <path fill="#fbbc04" d="M5.87 14.12a6.6 6.6 0 0 1 0-4.24V7.04H2.18a11 11 0 0 0 0 9.92l3.69-2.84z"/>
              <path fill="#ea4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.04l3.69 2.84C6.73 7.31 9.15 5.38 12 5.38z"/>
            </svg>
            Continue with Google
          </button>
          <button
            type="button"
            @click="signInWithGitHub"
            class="flex items-center justify-center gap-2 rounded-lg bg-bg px-3 py-2 text-sm font-medium text-text ring-1 ring-ring transition-colors hover:bg-surface-hover"
          >
            <svg class="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54v-1.92c-3.13.68-3.79-1.32-3.79-1.32-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.17 1.72 1.17 1 1.72 2.64 1.22 3.29.93.1-.73.39-1.22.71-1.5-2.5-.29-5.13-1.25-5.13-5.57 0-1.23.44-2.23 1.17-3.02-.12-.29-.51-1.45.11-3.03 0 0 .95-.3 3.12 1.15a10.86 10.86 0 0 1 5.68 0c2.17-1.45 3.12-1.15 3.12-1.15.62 1.58.23 2.74.11 3.03.73.79 1.17 1.79 1.17 3.02 0 4.33-2.64 5.28-5.15 5.56.4.35.76 1.04.76 2.1v3.11c0 .3.2.65.78.54 4.46-1.49 7.68-5.7 7.68-10.67C23.25 5.48 18.27.5 12 .5z"/>
            </svg>
            Continue with GitHub
          </button>
        </div>

        <!-- Divider -->
        <div class="relative flex items-center gap-3 my-5">
          <div class="h-px flex-1 bg-border"></div>
          <span class="text-xs text-muted">or</span>
          <div class="h-px flex-1 bg-border"></div>
        </div>

        <form @submit.prevent="handleSubmit" class="flex flex-col gap-4">
          <div v-if="mode === 'signup'" class="flex flex-col gap-1.5">
            <label for="name" class="text-sm font-medium text-muted">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              autocomplete="name"
              v-model="name"
              class="rounded-lg bg-bg px-3 py-2 text-sm text-text placeholder-muted ring-1 ring-ring outline-none focus-visible:ring-2 focus-visible:ring-accent -outline-offset-1 max-sm:text-base/6"
              placeholder="Your name"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="email" class="text-sm font-medium text-muted">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              v-model="email"
              required
              class="rounded-lg bg-bg px-3 py-2 text-sm text-text placeholder-muted ring-1 ring-ring outline-none focus-visible:ring-2 focus-visible:ring-accent -outline-offset-1 max-sm:text-base/6"
              placeholder="you@example.com"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="password" class="text-sm font-medium text-muted">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
              v-model="password"
              required
              minlength="8"
              class="rounded-lg bg-bg px-3 py-2 text-sm text-text placeholder-muted ring-1 ring-ring outline-none focus-visible:ring-2 focus-visible:ring-accent -outline-offset-1 max-sm:text-base/6"
              placeholder="At least 8 characters"
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
            {{ loading ? 'Please wait…' : submitLabel }}
          </button>
        </form>

        <div class="mt-4 text-center text-xs text-muted">
          <template v-if="mode === 'signin'">
            Don't have an account?
            <button type="button" @click="toggleMode" class="text-accent hover:underline">Sign up</button>
          </template>
          <template v-else>
            Already have an account?
            <button type="button" @click="toggleMode" class="text-accent hover:underline">Sign in</button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
