import { ref } from 'vue'

// Low-level pointer-drag lifecycle for the schedule calendar. It deliberately
// knows nothing about calendar geometry — the caller supplies `onDrag`
// (projection + live preview) and `onDrop` (commit / click). Keeping the math
// in the component lets the same primitive drive week move/resize and month
// move/expand, and — crucially — the projection recomputes from the live
// pointer each move, so it survives the grid re-rendering under it during
// edge auto-navigation.

export type DragMode = 'move' | 'resize-start' | 'resize-end' | 'resize-span'

export interface CalendarDragStart {
  /** Fired on each pointer move once the drag threshold is exceeded. */
  onDrag: (ev: PointerEvent) => void
  /** Fired once when the gesture ends. `moved` is false if it stayed a click. */
  onDrop: (moved: boolean, ev: PointerEvent) => void
  /** Element whose left/right edges arm auto-navigation while dragging. */
  edgeTarget?: () => HTMLElement | null
  /** Called after dwelling near an edge; dir -1 = previous range, +1 = next. */
  onEdgeNavigate?: (dir: -1 | 1) => void
}

const THRESHOLD = 4          // px of movement before a press becomes a drag
const EDGE_PX = 44           // proximity to an edge that arms auto-nav
const EDGE_DWELL_MS = 700    // hold near an edge this long to page the view

export function useCalendarDrag() {
  const isDragging = ref(false)

  function start(downEv: PointerEvent, opts: CalendarDragStart) {
    if (downEv.button !== 0) return // left button only; right-click = context menu
    const startX = downEv.clientX
    const startY = downEv.clientY
    const target = downEv.currentTarget as HTMLElement | null
    let moved = false
    let lastEv = downEv

    // ── Edge auto-navigation dwell timer ──
    let edgeDir: -1 | 1 | 0 = 0
    let edgeTimer: ReturnType<typeof setTimeout> | null = null
    const clearEdge = () => {
      edgeDir = 0
      if (edgeTimer) { clearTimeout(edgeTimer); edgeTimer = null }
    }
    const checkEdge = (ev: PointerEvent) => {
      const el = opts.edgeTarget?.()
      if (!el || !opts.onEdgeNavigate) return
      const r = el.getBoundingClientRect()
      const dir: -1 | 1 | 0 =
        ev.clientX < r.left + EDGE_PX ? -1 :
        ev.clientX > r.right - EDGE_PX ? 1 : 0
      if (dir === 0) { clearEdge(); return }
      if (dir === edgeDir) return // already armed for this side
      clearEdge()
      edgeDir = dir
      edgeTimer = setTimeout(() => {
        edgeTimer = null
        edgeDir = 0
        opts.onEdgeNavigate!(dir)
        // Re-project against the freshly navigated grid, then re-arm so a
        // continued hold keeps paging.
        opts.onDrag(lastEv)
        checkEdge(lastEv)
      }, EDGE_DWELL_MS)
    }

    const move = (ev: PointerEvent) => {
      lastEv = ev
      if (!moved) {
        if (Math.abs(ev.clientX - startX) < THRESHOLD &&
            Math.abs(ev.clientY - startY) < THRESHOLD) return
        moved = true
        isDragging.value = true
      }
      opts.onDrag(ev)
      checkEdge(ev)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      clearEdge()
      try { target?.releasePointerCapture?.(downEv.pointerId) } catch { /* target may be gone after re-render */ }
      isDragging.value = false
      opts.onDrop(moved, ev)
    }

    try { target?.setPointerCapture?.(downEv.pointerId) } catch { /* best effort */ }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return { isDragging, start }
}
