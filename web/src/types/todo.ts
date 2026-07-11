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
