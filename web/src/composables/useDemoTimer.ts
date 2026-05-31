import { ref, computed, onUnmounted } from 'vue'

/**
 * 30-minute countdown for the marketing demo session.
 *
 * Starts on first call (only when `isDemo` is true on the caller side); the
 * start timestamp lives in localStorage so a refresh keeps the same clock
 * rather than resetting to the full duration. Once `remainingSeconds` hits 0,
 * `expired` flips true — the App-level wrapper renders the end-of-demo modal.
 *
 * Paired with the 1-hour lazy-cleanup window on /api/demo/start: anything
 * older than the demo ceiling is definitively inactive and safe to delete.
 */
const STORAGE_KEY = 'demo_started_at'
const DURATION_SECONDS = 30 * 60

function readStart(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function writeStart(epochMs: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(epochMs))
  } catch {}
}

export function clearDemoTimer() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {}
}

export function useDemoTimer() {
  // Initialise: re-use an existing start timestamp if it's still in window,
  // otherwise stamp now. Means refreshes preserve the countdown.
  const existing = readStart()
  const nowMs = Date.now()
  const startedAt = existing && nowMs - existing < DURATION_SECONDS * 1000
    ? existing
    : nowMs
  if (startedAt !== existing) writeStart(startedAt)

  const tick = ref(0)
  const handle = setInterval(() => {
    tick.value++
  }, 1000)
  onUnmounted(() => clearInterval(handle))

  const remainingSeconds = computed(() => {
    // Re-read `tick` so the computed re-runs each second.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    tick.value
    const elapsed = Math.floor((Date.now() - startedAt) / 1000)
    return Math.max(0, DURATION_SECONDS - elapsed)
  })

  const expired = computed(() => remainingSeconds.value === 0)

  const formatted = computed(() => {
    const s = remainingSeconds.value
    const mm = Math.floor(s / 60)
    const ss = s % 60
    return `${mm}:${String(ss).padStart(2, '0')}`
  })

  return { remainingSeconds, expired, formatted }
}
