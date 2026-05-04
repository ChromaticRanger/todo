import { Priority } from '../types/todo'

export function priorityBorderClass(priority: number): string {
  switch (priority) {
    case Priority.HIGH: return 'border-l-danger'
    case Priority.LOW: return 'border-l-green-400'
    default: return 'border-l-blue-500'
  }
}
