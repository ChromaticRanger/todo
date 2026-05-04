<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { authClient } from '../lib/auth-client'
import { useAuthStore } from '../stores/authStore'
import { apiFetch } from '../lib/api'

const authStore = useAuthStore()
const error = ref('')
const busy = ref<'free' | 'monthly' | 'yearly' | null>(null)
const activating = ref(false)

const origin = typeof window !== 'undefined' ? window.location.origin : ''

async function chooseFree() {
  error.value = ''
  busy.value = 'free'
  try {
    const res = await apiFetch('/api/plan/select-free', { method: 'POST' })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      error.value = body?.error ?? 'Failed to activate Free plan'
      return
    }
    await authStore.refreshUser()
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = null
  }
}

async function choosePro(annual: boolean) {
  error.value = ''
  busy.value = annual ? 'yearly' : 'monthly'
  try {
    const { error: err } = await authClient.subscription.upgrade({
      plan: 'pro',
      annual,
      successUrl: `${origin}/?billing=success`,
      cancelUrl: `${origin}/?billing=cancel`,
    })
    if (err) {
      error.value = err.message || 'Failed to start checkout'
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    busy.value = null
  }
}

// Webhook and return from Stripe race each other. If we land here with
// ?billing=success but tier is still null, poll briefly for the webhook.
onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  if (params.get('billing') !== 'success') return
  window.history.replaceState({}, '', window.location.pathname)
  activating.value = true
  for (let i = 0; i < 10; i++) {
    await authStore.refreshUser()
    if (authStore.tier) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  activating.value = false
})
</script>

<template>
  <div class="min-h-dvh bg-bg flex items-center justify-center p-6 antialiased">
    <div class="w-full max-w-5xl">
      <div class="flex flex-col items-center gap-3 mb-12">
        <img src="/stash-squirrel.svg" alt="Stash Squirrel" class="size-20" />
        <h1
          class="font-display italic text-4xl/12 sm:text-5xl/14 font-semibold tracking-tight bg-gradient-to-br from-[#e53b30] via-[#c92c24] to-[#8b2a1f] bg-clip-text text-transparent pr-2 pb-2"
        >
          Choose your plan
        </h1>
        <p class="text-base text-muted text-center text-balance max-w-md">
          Pick a plan to finish setting up your account. You can switch later.
        </p>
      </div>

      <div v-if="activating" class="mb-4 rounded-lg bg-surface ring-1 ring-ring px-4 py-3 text-sm text-muted text-center">
        Activating your subscription…
      </div>

      <div v-if="error" class="mb-4 rounded-lg bg-danger-bg ring-1 ring-danger/60 px-4 py-3 text-sm text-danger-fg">
        {{ error }}
      </div>

      <div class="grid gap-6 sm:grid-cols-3">
        <!-- Free -->
        <div class="rounded-2xl bg-surface ring-1 ring-ring p-8 flex flex-col justify-between dark:inset-ring dark:inset-ring-white/5">
          <div>
            <h2 class="text-lg font-semibold text-text">Free</h2>
            <p class="mt-1 text-sm text-muted">For casual stashers.</p>
            <p class="mt-6 tabular-nums">
              <span class="text-5xl font-semibold text-text">£0</span>
              <span class="text-sm text-muted">/forever</span>
            </p>
            <ul role="list" class="mt-6 flex flex-col gap-2 text-sm text-text">
              <li>• Up to 3 lists</li>
              <li>• Up to 50 items across all lists</li>
              <li>• Todos, bookmarks &amp; notes</li>
              <li>• Categories with drag-to-reorder</li>
              <li>• Grid &amp; kanban layouts</li>
              <li>• Today / Week / Month / Overdue views</li>
              <li>• Light &amp; dark themes</li>
            </ul>
          </div>
          <button
            type="button"
            class="mt-8 rounded-lg bg-bg px-4 py-2.5 text-sm font-medium text-text ring-1 ring-ring transition-colors hover:bg-surface-hover disabled:opacity-50"
            :disabled="busy !== null"
            @click="chooseFree"
          >
            {{ busy === 'free' ? 'Please wait…' : 'Start free' }}
          </button>
        </div>

        <!-- Pro Monthly -->
        <div class="rounded-2xl bg-surface ring-1 ring-accent/60 p-8 flex flex-col justify-between dark:inset-ring dark:inset-ring-white/5">
          <div>
            <h2 class="text-lg font-semibold text-text">Pro · Monthly</h2>
            <p class="mt-1 text-sm text-muted">For serious stashers.</p>
            <p class="mt-6 tabular-nums">
              <span class="text-5xl font-semibold text-text">£6</span>
              <span class="text-sm text-muted">/month</span>
            </p>
            <ul role="list" class="mt-6 flex flex-col gap-2 text-sm text-text">
              <li>• Everything in Free</li>
              <li>• Unlimited lists</li>
              <li>• Unlimited items</li>
              <li>• Overall Schedule — every todo with a due date in one Calendar</li>
              <li>• Global search across lists (Ctrl/⌘K)</li>
              <li>• Cancel anytime</li>
            </ul>
          </div>
          <button
            type="button"
            class="mt-8 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            :disabled="busy !== null"
            @click="choosePro(false)"
          >
            {{ busy === 'monthly' ? 'Please wait…' : 'Go Pro Monthly' }}
          </button>
        </div>

        <!-- Pro Yearly -->
        <div class="relative rounded-2xl bg-surface ring-1 ring-accent p-8 flex flex-col justify-between dark:inset-ring dark:inset-ring-white/5">
          <span
            class="absolute -top-3 right-5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-fg"
          >
            Save ~17%
          </span>
          <div>
            <h2 class="text-lg font-semibold text-text">Pro · Yearly</h2>
            <p class="mt-1 text-sm text-muted">Best value.</p>
            <p class="mt-6 tabular-nums">
              <span class="text-5xl font-semibold text-text">£60</span>
              <span class="text-sm text-muted">/year</span>
            </p>
            <ul role="list" class="mt-6 flex flex-col gap-2 text-sm text-text">
              <li>• Everything in Pro Monthly</li>
              <li>• 2 months free</li>
              <li>• Cancel anytime</li>
            </ul>
          </div>
          <button
            type="button"
            class="mt-8 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            :disabled="busy !== null"
            @click="choosePro(true)"
          >
            {{ busy === 'yearly' ? 'Please wait…' : 'Go Pro Yearly' }}
          </button>
        </div>
      </div>

      <div class="mt-8 text-center">
        <button
          type="button"
          class="text-xs text-muted hover:text-text transition-colors"
          @click="authStore.logout()"
        >
          Sign out
        </button>
      </div>
    </div>
  </div>
</template>
