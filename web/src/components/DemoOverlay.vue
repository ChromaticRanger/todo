<script setup lang="ts">
/**
 * Wraps the marketing-demo experience as one mountable unit: the top banner,
 * the countdown timer, and the end-of-demo modal. Only mounted by App.vue
 * when `authStore.isDemo` is true — so non-demo users pay no timer cost.
 */
import { ref, watch } from 'vue'
import { useDemoTimer, clearDemoTimer } from '../composables/useDemoTimer'
import DemoBanner from './DemoBanner.vue'
import DemoExpiredModal from './DemoExpiredModal.vue'

const { formatted, remainingSeconds, expired } = useDemoTimer()

// Flip-and-stay: once the timer hits zero we show the modal until the
// visitor leaves, even if remainingSeconds somehow recomputes upward.
const showExpiredModal = ref(false)
watch(expired, (e) => {
  if (e) showExpiredModal.value = true
})

function goSignUp() {
  // Keep the demo session alive — LoginPage's promote-signup flow needs an
  // authenticated demo cookie to reassign the visitor's work. The session is
  // consumed (and the demo user deleted) on successful signup.
  clearDemoTimer()
  window.location.assign('/login?mode=signup')
}

async function goExit() {
  // Let the visitor bail out before the timer expires. Sign the demo out so
  // the next page is unauthenticated, then drop them back on the landing page.
  try {
    await fetch('/api/demo/end', { method: 'POST', credentials: 'include' })
  } catch {
    // best-effort — visitor is leaving anyway
  }
  clearDemoTimer()
  window.location.assign('/')
}
</script>

<template>
  <DemoBanner
    :formatted="formatted"
    :remaining-seconds="remainingSeconds"
    :on-sign-up="goSignUp"
    :on-exit="goExit"
  />
  <DemoExpiredModal v-if="showExpiredModal" />
</template>
