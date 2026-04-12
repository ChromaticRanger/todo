<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true
  try {
    const success = await authStore.login(username.value, password.value)
    if (!success) {
      error.value = 'Invalid username or password'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh bg-gray-950 flex items-center justify-center p-4 antialiased">
    <div class="w-full max-w-xs">
      <!-- Branding -->
      <div class="flex flex-col items-center gap-3 mb-8">
        <div class="flex size-12 items-center justify-center rounded-xl bg-gray-900 ring-1 ring-white/10">
          <svg class="size-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4" />
          </svg>
        </div>
        <h1 class="text-xl font-semibold text-gray-100">Todo Dashboard</h1>
      </div>

      <!-- Login card -->
      <div class="rounded-2xl bg-gray-900 ring-1 ring-white/10 p-6">
        <form @submit.prevent="handleSubmit" class="flex flex-col gap-5">
          <div class="flex flex-col gap-1.5">
            <label for="username" class="text-sm font-medium text-gray-300">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autocomplete="username"
              v-model="username"
              required
              class="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 ring-1 ring-white/10 outline-none focus-visible:ring-2 focus-visible:ring-purple-500 -outline-offset-1 max-sm:text-base/6"
              placeholder="Username"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <label for="password" class="text-sm font-medium text-gray-300">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              v-model="password"
              required
              class="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 ring-1 ring-white/10 outline-none focus-visible:ring-2 focus-visible:ring-purple-500 -outline-offset-1 max-sm:text-base/6"
              placeholder="Password"
            />
          </div>

          <div v-if="error" class="rounded-lg bg-red-950/60 px-3 py-2 ring-1 ring-red-800/60">
            <p class="text-sm text-red-400">{{ error }}</p>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg v-if="loading" class="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
