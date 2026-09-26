export const Priority = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
} as const

export type Priority = (typeof Priority)[keyof typeof Priority]

export const Status = {
  PENDING: 0,
  COMPLETED: 1,
} as const

export type Status = (typeof Status)[keyof typeof Status]

export type ViewType = 'all' | 'today' | 'week' | 'month' | 'overdue' | 'completed'

export type ItemType = 'todo' | 'bookmark' | 'note' | 'event'

export interface Todo {
  id: number
  list_name: string
  title: string
  description: string
  category: string
  priority: Priority
  status: Status
  created_at: number
  completed_at: number | null
  due_date: number | null
  repeat_days: number
  repeat_months: number
  spawned_next: number
  type: ItemType
  url: string | null
  snoozed_until: number | null
  recur_until: number | null
  duration_seconds: number | null
  color: string | null
  all_day: boolean
  // Present only on expanded recurring-event occurrences: the original
  // cadence-generated start, used as the key when editing a single occurrence.
  occurrence_start?: number | null

  // ── Shared lists ──────────────────────────────────────────────────────────
  // Present only on rows belonging to a list someone shared with you. All
  // optional so own-list responses are unchanged.
  //
  // NB `list_name` above stays the OWNER's list name; `list_key` is what this
  // client keys caches, tabs and preferences by. Use `keyOf(todo)` rather than
  // comparing `list_name` to the active list.
  /** `@<collabId>` — the client-side identity of the shared list. */
  list_key?: string
  collab_id?: number
  /** Display name of whoever owns the list this item lives in. */
  owner_name?: string | null
  /** Display name of whoever added the item, when it wasn't the owner. */
  created_by_name?: string | null
  /** False when you're a viewer on the shared list. */
  can_write?: boolean
}

/**
 * The list identity a todo belongs to from THIS user's point of view: the share
 * key for a shared item, otherwise the plain list name. Every comparison
 * against the active list must go through this.
 */
export function keyOf(todo: Pick<Todo, 'list_name' | 'list_key'>): string {
  return todo.list_key ?? todo.list_name
}

/** True when the item lives in a list shared with this user. */
export function isSharedTodo(todo: Pick<Todo, 'list_key'>): boolean {
  return todo.list_key != null
}

export interface TodoFormData {
  title: string
  description: string
  category: string
  priority: Priority
  due_date: number | null
  repeat_days: number
  repeat_months: number
  type: ItemType
  url: string | null
  recur_until?: number | null
  duration_seconds?: number | null
  color?: string | null
  all_day?: boolean
  // Only sent when the edit form clears an active snooze (unsnooze). Omitted
  // otherwise so a normal save leaves the snooze untouched.
  snoozed_until?: number | null
}
