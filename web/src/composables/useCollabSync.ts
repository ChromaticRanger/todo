import { onMounted, onUnmounted, ref, watch } from 'vue'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { useListStore } from '../stores/listStore'
import { useTodoStore } from '../stores/todoStore'
import { useCollabStore } from '../stores/collabStore'
import { useItemDrag } from './useItemDrag'

/**
 * Keeps shared lists up to date with what other people are doing.
 *
 * Two transports, one code path. A Server-Sent Events stream does the real
 * work — near-instant, and no requests at all while nothing is happening — and
 * the original poll stays underneath it as a fallback. That isn't belt and
 * braces: we run more than one app instance, and cross-instance delivery
 * depends on a Postgres listener that can be down on one instance while
 * everything else looks healthy. Failure there is invisible, so the poll drops
 * to a slow heartbeat rather than switching off.
 *
 * Everything downstream — cache invalidation, the optimistic-update race, not
 * yanking the view out from under a drag — lives in the store and is unchanged
 * from the polling-only version.
 */

// Cadence for the poll when it's carrying the load on its own. A share you're
// actually part of is worth checking often; someone with no shares is only
// waiting on a possible invite, and they're the overwhelming majority.
const ACTIVE_MS = 20_000
const IDLE_MS = 120_000
// Cadence once the stream is up: purely a safety net against a fan-out failure
// we'd otherwise never notice.
const STREAMING_MS = 300_000

interface ChangeFeed {
  now: number
  changed: number[]
  visible: number[]
  pending_invites: number
}

export function useCollabSync() {
  const authStore = useAuthStore()
  const listStore = useListStore()
  const todoStore = useTodoStore()
  const collabStore = useCollabStore()
  const { dragging } = useItemDrag()

  const lastSeen = ref(0)
  const knownVisible = ref<string>('')
  const knownPendingCount = ref(-1)
  const streaming = ref(false)
  // A self-rescheduling timeout rather than an interval, so the cadence can
  // change the moment the stream connects or the user's first share appears.
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  const pollMs = ref(IDLE_MS)

  let source: EventSource | null = null
  let running = false

  function hidden(): boolean {
    return typeof document !== 'undefined' && document.hidden
  }

  function currentPollMs(): number {
    if (streaming.value) return STREAMING_MS
    return knownVisible.value === '' ? IDLE_MS : ACTIVE_MS
  }

  /** collab id → the key THIS user addresses that list by. */
  function keyForCollab(collabId: number): string | null {
    const shared = listStore.sharedLists.find((s) => s.collab_id === collabId)
    if (shared) return shared.key
    // A list we own and have shared: our key for it is its plain name.
    for (const [name, status] of Object.entries(listStore.sharedByMe)) {
      if (status.collab_id === collabId) return name
    }
    return null
  }

  async function tick() {
    if (inFlight || !authStore.isAuthenticated) return
    if (hidden()) return
    inFlight = true
    try {
      const since = lastSeen.value ? `?since=${lastSeen.value}` : ''
      const res = await apiFetch(`/api/collab/changes${since}`)
      if (!res.ok) return
      const data = (await res.json()) as ChangeFeed
      lastSeen.value = data.now

      // A share appearing or disappearing (accepted, revoked, or someone left)
      // changes the tab strip, so the list index has to be refetched before we
      // can map any collab id to a key.
      const visibleKey = data.visible.slice().sort((a, b) => a - b).join(',')
      const first = knownVisible.value === ''
      if (visibleKey !== knownVisible.value) {
        knownVisible.value = visibleKey
        if (!first) await listStore.fetchLists()
      }

      pollMs.value = currentPollMs()

      for (const collabId of data.changed) {
        const key = keyForCollab(collabId)
        if (key) todoStore.applyRemoteChange(key)
      }

      if (data.pending_invites !== knownPendingCount.value) {
        knownPendingCount.value = data.pending_invites
        void collabStore.fetchPending()
      }
    } catch {
      // Offline or a blip — the next tick picks it up. Never surface this.
    } finally {
      inFlight = false
    }
  }

  // ── Stream ────────────────────────────────────────────────────────────────

  // Nothing is applied while the tab is in the background: it would refetch
  // into a view nobody is looking at, and `onVisibility` reconciles the whole
  // gap through the change feed the moment the tab comes back.
  function applyListChanged(collabId: number) {
    if (hidden()) return
    const key = keyForCollab(collabId)
    // A collab we can't map yet is one the tab strip doesn't know about — the
    // membership event that introduces it may not have landed. Fall back to the
    // change feed, which refetches the list index as part of its work.
    if (key) todoStore.applyRemoteChange(key)
    else void tick()
  }

  async function applyMembershipChanged(collabId: number) {
    if (hidden()) return
    // Roles and visibility both live in the list index, and both decide which
    // controls render, so this has to land before anything else reads it.
    await listStore.fetchLists()
    const key = keyForCollab(collabId)
    if (key) todoStore.applyRemoteChange(key)
    pollMs.value = currentPollMs()
  }

  function openStream() {
    if (source || typeof EventSource === 'undefined') return

    const es = new EventSource('/api/events', { withCredentials: true })
    source = es

    es.onopen = () => {
      streaming.value = true
      pollMs.value = currentPollMs()
    }

    es.onerror = () => {
      // EventSource reconnects on its own; until it does, the poll carries the
      // load again at its normal cadence.
      streaming.value = false
      pollMs.value = currentPollMs()
    }

    es.addEventListener('list_changed', (e) => {
      const { collab_id } = JSON.parse((e as MessageEvent).data) as { collab_id: number }
      applyListChanged(collab_id)
    })

    es.addEventListener('membership_changed', (e) => {
      const { collab_id } = JSON.parse((e as MessageEvent).data) as { collab_id: number }
      void applyMembershipChanged(collab_id)
    })

    es.addEventListener('invite_received', () => {
      if (hidden()) return
      void collabStore.fetchPending()
    })

    // Sent on connect and after any server-side gap (a deploy, a dropped
    // listener). Rather than replay a log, the server says "you may have missed
    // something" and we run the change feed, which reconciles everything.
    es.addEventListener('resync', () => {
      if (hidden()) return
      void tick()
    })
  }

  function closeStream() {
    if (!source) return
    source.close()
    source = null
    streaming.value = false
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  function schedule() {
    if (!running) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      await tick()
      schedule()
    }, pollMs.value)
  }

  function start() {
    if (running) return
    running = true
    openStream()
    void tick().then(schedule)
  }

  function stop() {
    running = false
    closeStream()
    if (timer) clearTimeout(timer)
    timer = null
  }

  // Coming back to the tab is the moment staleness is most visible, and it's
  // also where anything the stream delivered while we were hidden gets picked
  // up, so check immediately rather than waiting out the rest of the interval.
  function onVisibility() {
    if (document.hidden) return
    void tick().then(schedule)
  }

  // A drag reorders items in place; replacing `todos` mid-gesture would drop
  // the element being dragged.
  watch(dragging, (isDragging) => {
    todoStore.suspendRemote = isDragging
  })

  watch(
    () => authStore.isAuthenticated,
    (signedIn) => {
      if (signedIn) start()
      else {
        stop()
        lastSeen.value = 0
        knownVisible.value = ''
        knownPendingCount.value = -1
      }
    }
  )

  onMounted(() => {
    document.addEventListener('visibilitychange', onVisibility)
    if (authStore.isAuthenticated) start()
  })

  onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    stop()
  })
}
