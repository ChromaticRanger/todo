<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useTodoStore } from '../stores/todoStore'
import { useListStore } from '../stores/listStore'
import { usePlanStore } from '../stores/planStore'
import { useSettingsStore } from '../stores/settingsStore'
import { authClient } from '../lib/auth-client'
import ThemePicker from './ThemePicker.vue'
import type { ItemType } from '../types/todo'

const emit = defineEmits<{
  add: [type: ItemType]
  'toggle-calendar': []
  search: []
}>()

const props = defineProps<{ calendarActive?: boolean }>()

const appVersion = __APP_VERSION__

const authStore = useAuthStore()
const todoStore = useTodoStore()
const listStore = useListStore()
const planStore = usePlanStore()
const settingsStore = useSettingsStore()
const showTypeMenu = ref(false)
const showBillingMenu = ref(false)
const billingBusy = ref(false)
const billingError = ref('')

function flashBillingError(msg: string) {
  billingError.value = msg
  setTimeout(() => (billingError.value = ''), 6000)
}

async function loadPlanStatus() {
  if (!authStore.isAuthenticated || authStore.needsPlanChoice) return
  await planStore.refresh()
}

onMounted(loadPlanStatus)
watch(
  () => [authStore.user?.id ?? null, authStore.tier, authStore.needsPlanChoice],
  (next, prev) => {
    if (next[0] !== prev?.[0]) planStore.reset()
    loadPlanStatus()
  }
)

// Refresh plan status whenever list or todo counts change so the banner
// reflects the current state without a page refresh.
watch(
  () => [listStore.lists.length, todoStore.todos.length],
  () => {
    if (authStore.tier === 'free') loadPlanStatus()
  }
)

const capStatus = computed<{ severity: 'over' | 'at'; message: string } | null>(() => {
  const s = planStore.status
  if (!s || s.tier !== 'free') return null
  // Combine server-reported list count with locally-added-but-empty lists so
  // UI-only lists that haven't had items added yet still count.
  const effectiveListCount = Math.max(s.listCount, listStore.lists.length)
  const atListCap = effectiveListCount >= s.limits.maxLists
  const atItemCap = s.itemCount >= s.limits.maxItems

  // Only surface the banner when the user is fully blocked — both caps hit
  // simultaneously. The disabled "+ New list" button handles the
  // list-cap-only case; the toast on failed item-add handles transient
  // item-cap hits.
  if (!(atListCap && atItemCap)) return null

  const over = s.overListCap && s.overItemCap
  const counts = `${effectiveListCount}/${s.limits.maxLists} lists and ${s.itemCount}/${s.limits.maxItems} items`

  return over
    ? {
        severity: 'over',
        message: `You're above the Free plan limit — ${counts}. Existing items stay editable; new additions are paused until you're back under cap or upgrade to Pro.`,
      }
    : {
        severity: 'at',
        message: `You've reached the Free plan limit — ${counts}. To add more, delete something or upgrade to Pro.`,
      }
})

const displayName = computed(() => {
  const u = authStore.user
  if (!u) return ''
  return u.name?.trim() || u.email?.split('@')[0] || ''
})

const initial = computed(() => {
  const source = displayName.value || authStore.user?.email || ''
  return source.charAt(0).toUpperCase() || '?'
})

function openAdd(type: ItemType) {
  showTypeMenu.value = false
  emit('add', type)
}

async function openBillingPortal() {
  showBillingMenu.value = false
  billingBusy.value = true
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
      returnUrl: window.location.origin,
    })
    if (error) {
      console.error('[billing] portal error:', error)
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
  showBillingMenu.value = false
  billingBusy.value = true
  try {
    const { error } = await authClient.subscription.upgrade({
      plan: 'pro',
      annual,
      successUrl: `${window.location.origin}/?billing=success`,
      cancelUrl: `${window.location.origin}/?billing=cancel`,
    })
    if (error) {
      console.error('[billing] upgrade error:', error)
      flashBillingError(error.message || "Couldn't start checkout.")
    }
  } catch (e) {
    flashBillingError(String(e))
  } finally {
    billingBusy.value = false
  }
}
</script>

<template>
  <div class="flex-shrink-0">
  <header class="bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <img src="/stash-squirrel.svg" alt="Stash Squirrel" class="size-12" />
      <div class="flex flex-col leading-none">
        <h1
          class="font-display italic text-3xl font-semibold tracking-tight bg-gradient-to-br from-[#e53b30] via-[#c92c24] to-[#8b2a1f] bg-clip-text text-transparent pr-2"
        >
          Stash Squirrel
        </h1>
        <span class="text-xs text-muted tracking-wide pl-1 mt-0.5">v{{ appVersion }}</span>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <!-- Add button with type dropdown -->
      <div data-tour="add-buttons" class="relative">
        <button
          class="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-medium transition-colors"
          @click="showTypeMenu = !showTypeMenu"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add
          <svg class="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div
          v-if="showTypeMenu"
          class="absolute right-0 top-full mt-1 z-20 bg-surface border border-border-strong rounded-lg shadow-lg py-1 min-w-48"
        >
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            @click="openAdd('todo')"
          >
            <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="flex-1">Todo</span>
            <kbd class="text-[11px] text-muted font-mono tracking-tight">Alt+T</kbd>
          </button>
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            @click="openAdd('bookmark')"
          >
            <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
            <span class="flex-1">Bookmark</span>
            <kbd class="text-[11px] text-muted font-mono tracking-tight">Alt+B</kbd>
          </button>
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2"
            @click="openAdd('note')"
          >
            <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="flex-1">Note</span>
            <kbd class="text-[11px] text-muted font-mono tracking-tight">Alt+N</kbd>
          </button>
          <button
            v-if="authStore.tier === 'pro'"
            class="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover flex items-center gap-2 border-t border-border/60 mt-1 pt-1.5"
            @click="openAdd('event')"
          >
            <svg class="size-3.5 text-muted shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="flex-1">Event</span>
            <span class="rounded-full bg-accent/15 text-accent text-[10px] font-semibold px-1.5 py-0.5 tracking-wide">Pro</span>
          </button>
        </div>

        <!-- Click-outside overlay -->
        <div
          v-if="showTypeMenu"
          class="fixed inset-0 z-10"
          @click="showTypeMenu = false"
        />
      </div>

      <!-- Overall Schedule (Pro only) -->
      <button
        v-if="authStore.tier === 'pro'"
        type="button"
        data-tour="schedule"
        class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors"
        :class="props.calendarActive
          ? 'bg-accent text-accent-fg'
          : 'text-muted hover:text-text hover:bg-surface-hover'"
        :title="props.calendarActive ? 'Back to lists' : 'Overall schedule'"
        @click="emit('toggle-calendar')"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span class="max-md:hidden">Schedule</span>
      </button>

      <!-- Global search (Pro only) -->
      <button
        v-if="authStore.tier === 'pro'"
        type="button"
        data-tour="search"
        class="flex items-center justify-center size-9 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Search (Ctrl/⌘K)"
        aria-label="Search"
        @click="emit('search')"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
        </svg>
      </button>

      <ThemePicker />

      <!-- Welcome tour replay -->
      <button
        type="button"
        class="flex items-center justify-center size-9 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Show welcome tour"
        aria-label="Show welcome tour"
        @click="settingsStore.replayWelcome()"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      <!-- Billing -->
      <div v-if="authStore.tier" class="relative">
        <button
          type="button"
          :disabled="billingBusy"
          class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-muted hover:text-text hover:bg-surface-hover text-sm transition-colors disabled:opacity-50"
          :title="authStore.tier === 'pro' ? 'Manage subscription' : 'Upgrade to Pro'"
          @click="authStore.tier === 'pro' ? openBillingPortal() : (showBillingMenu = !showBillingMenu)"
        >
          <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
          </svg>
          <span class="max-md:hidden">{{ authStore.tier === 'pro' ? 'Billing' : 'Upgrade' }}</span>
        </button>

        <div
          v-if="showBillingMenu && authStore.tier === 'free'"
          class="absolute right-0 top-full mt-1 z-20 bg-surface border border-border-strong rounded-lg shadow-lg py-1 min-w-56"
        >
          <button
            class="w-full text-left px-3 py-2 text-sm text-text hover:bg-surface-hover"
            @click="upgradeTo(false)"
          >
            <div class="font-medium">Pro · Monthly</div>
            <div class="text-xs text-muted">£6 / month</div>
          </button>
          <button
            class="w-full text-left px-3 py-2 text-sm text-text hover:bg-surface-hover"
            @click="upgradeTo(true)"
          >
            <div class="font-medium flex items-center gap-2">
              Pro · Yearly
              <span class="rounded-full bg-accent/15 text-accent text-[10px] font-semibold px-1.5 py-0.5">Save ~17%</span>
            </div>
            <div class="text-xs text-muted">£60 / year</div>
          </button>
        </div>

        <div
          v-if="showBillingMenu"
          class="fixed inset-0 z-10"
          @click="showBillingMenu = false"
        />
      </div>

      <!-- Current user -->
      <div
        v-if="authStore.user"
        data-tour="user-menu"
        class="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg text-sm text-text"
        :title="authStore.user.email ?? ''"
      >
        <img
          v-if="authStore.user.image"
          :src="authStore.user.image"
          :alt="displayName"
          class="size-7 rounded-full outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10"
        />
        <div
          v-else
          aria-hidden="true"
          class="flex size-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-semibold outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10"
        >
          {{ initial }}
        </div>
        <span class="max-md:hidden font-medium leading-none">{{ displayName }}</span>
        <span
          v-if="authStore.tier"
          class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none"
          :class="authStore.tier === 'pro'
            ? 'bg-accent/15 text-accent'
            : 'bg-muted/15 text-muted'"
          :title="authStore.tier === 'pro' ? 'Pro plan' : 'Free plan'"
        >
          {{ authStore.tier }}
        </span>
      </div>

      <button
        type="button"
        class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-muted hover:text-text hover:bg-surface-hover text-sm transition-colors"
        @click="authStore.logout()"
        title="Sign out"
      >
        <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        Sign out
      </button>
    </div>
  </header>

  <div
    v-if="capStatus"
    :class="[
      'px-4 py-2 text-sm flex items-center justify-between gap-3 border-b',
      capStatus.severity === 'over'
        ? 'bg-danger-bg border-danger/60 text-danger-fg'
        : 'bg-accent/10 border-accent/40 text-text'
    ]"
  >
    <span>{{ capStatus.message }}</span>
    <button
      type="button"
      class="shrink-0 rounded-lg bg-accent px-3 py-1 text-xs font-medium text-accent-fg hover:bg-accent-hover transition-colors"
      @click="upgradeTo(false)"
    >
      Upgrade
    </button>
  </div>

  <div
    v-if="billingError"
    class="bg-danger-bg border-b border-danger/60 px-4 py-2 text-sm text-danger-fg flex items-center justify-between gap-3"
  >
    <span>{{ billingError }}</span>
    <button
      type="button"
      class="shrink-0 text-xs text-danger-fg/80 hover:text-danger-fg"
      @click="billingError = ''"
    >
      Dismiss
    </button>
  </div>
  </div>
</template>
