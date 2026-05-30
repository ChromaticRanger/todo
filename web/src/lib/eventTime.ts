// Helpers for rendering and filtering time-block events.
//
// An event row may have a positive `duration_seconds` (a time block) or NULL
// (a legacy point-in-time event). The helpers below treat both cases so the
// rest of the app doesn't need to branch every time it formats or filters.

import type { Todo } from '../types/todo'

/** End epoch (exclusive) of an event. For point-in-time events this equals start. */
export function eventEnd(t: Todo): number {
  if (t.due_date == null) return 0
  return t.due_date + (t.duration_seconds ?? 0)
}

/** True when the event's [start, end) overlaps the day starting at `dayEpoch`. */
export function eventOccursOnDay(t: Todo, dayEpoch: number): boolean {
  if (t.due_date == null) return false
  const dayEnd = dayEpoch + 86400
  const end = t.due_date + (t.duration_seconds ?? 0)
  // Point-in-time events: include when start falls inside the day window.
  // Time-block events: include when [start, end) overlaps the day window.
  if (t.duration_seconds == null || t.duration_seconds === 0) {
    return t.due_date >= dayEpoch && t.due_date < dayEnd
  }
  return t.due_date < dayEnd && end > dayEpoch
}

const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' }
const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  weekday: 'short', day: 'numeric', month: 'short',
  hour: 'numeric', minute: '2-digit',
}

/**
 * Time-only range: "9:00 AM" (point-in-time) or "9:00–9:30 AM" (block).
 * For multi-day blocks the end date is appended.
 */
export function formatEventTimeRange(start: number, durationSec: number | null): string {
  const startDate = new Date(start * 1000)
  const startStr = startDate.toLocaleTimeString(undefined, TIME_OPTS)
  if (!durationSec) return startStr
  const endDate = new Date((start + durationSec) * 1000)
  const sameDay =
    endDate.getFullYear() === startDate.getFullYear() &&
    endDate.getMonth() === startDate.getMonth() &&
    endDate.getDate() === startDate.getDate()
  if (sameDay) {
    return `${startStr}–${endDate.toLocaleTimeString(undefined, TIME_OPTS)}`
  }
  const endStr = endDate.toLocaleString(undefined, DATETIME_OPTS)
  return `${startStr} – ${endStr}`
}

/**
 * Full datetime range: "Tue, 9 Jan, 9:00 AM" (point-in-time) or
 * "Tue, 9 Jan, 9:00–9:30 AM" (same-day block) or
 * "Tue, 9 Jan, 9:00 AM – Wed, 10 Jan, 5:00 PM" (multi-day block).
 */
export function formatEventDateTimeRange(start: number, durationSec: number | null): string {
  const startDate = new Date(start * 1000)
  const startStr = startDate.toLocaleString(undefined, DATETIME_OPTS)
  if (!durationSec) return startStr
  const endDate = new Date((start + durationSec) * 1000)
  const sameDay =
    endDate.getFullYear() === startDate.getFullYear() &&
    endDate.getMonth() === startDate.getMonth() &&
    endDate.getDate() === startDate.getDate()
  if (sameDay) {
    return `${startStr}–${endDate.toLocaleTimeString(undefined, TIME_OPTS)}`
  }
  return `${startStr} – ${endDate.toLocaleString(undefined, DATETIME_OPTS)}`
}
