<script setup lang="ts">
import { ref } from 'vue'
import { clearDemoTimer } from '../composables/useDemoTimer'

const busy = ref<'signup' | 'home' | null>(null)

async function end(next: 'signup' | 'home') {
  if (busy.value) return
  busy.value = next
  // For Sign Up, keep the demo session cookie — LoginPage's promote-signup
  // flow needs it to reassign the visitor's work to the new account. For
  // Back to Home, sign the demo out so the next page is unauthenticated.
  if (next === 'home') {
    try {
      await fetch('/api/demo/end', { method: 'POST', credentials: 'include' })
    } catch {
      // best-effort — visitor is leaving anyway
    }
  }
  clearDemoTimer()
  window.location.assign(next === 'signup' ? '/login?mode=signup' : '/')
}
</script>

<template>
  <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <!-- Backdrop, captures all pointer events so the demo can't be poked
         behind the modal. -->
    <div class="absolute inset-0 bg-bg/85 backdrop-blur-sm" />

    <div
      class="animate-modal-in relative w-full max-w-md rounded-2xl bg-surface p-8 shadow-2xl ring-1 ring-border-strong dark:inset-ring dark:inset-ring-white/5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-expired-title"
    >
      <h2 id="demo-expired-title" class="font-display italic text-3xl font-semibold tracking-tight text-text">
        Time's up
      </h2>
      <p class="mt-3 text-muted text-balance">
        Like what you see? Create an account to start your own — lists,
        todos, bookmarks, and events, yours for free.
      </p>
      <div class="mt-6 flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          class="rounded-xl bg-accent px-5 py-3 text-base font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          :disabled="busy !== null"
          @click="end('signup')"
        >
          {{ busy === 'signup' ? 'One moment…' : 'Sign up — it’s free' }}
        </button>
        <button
          type="button"
          class="rounded-xl bg-bg px-5 py-3 text-base font-medium text-text ring-1 ring-ring transition-colors hover:bg-surface-hover disabled:opacity-50"
          :disabled="busy !== null"
          @click="end('home')"
        >
          {{ busy === 'home' ? 'One moment…' : 'Back to home' }}
        </button>
      </div>
    </div>
  </div>
</template>
