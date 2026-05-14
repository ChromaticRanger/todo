// Human-friendly label for a (repeat_days, repeat_months) pair. Recognizes the
// common presets (Daily / Weekly / Fortnightly / Monthly / Yearly) and falls
// back to "Every N {days|months}" for arbitrary intervals. Used by both the
// Discover tiles and the event recurrence indicator.
export function describeRecurrence(days: number, months: number): string {
  if (days === 1) return 'Daily'
  if (days === 7) return 'Weekly'
  if (days === 14) return 'Fortnightly'
  if (days > 0) return `Every ${days} days`
  if (months === 1) return 'Monthly'
  if (months === 12) return 'Yearly'
  if (months > 0) return `Every ${months} months`
  return ''
}
