// Fixed per-item colour palette for the schedule calendar.
//
// Keys map to CSS tokens (--evt-<key>) defined in src/style.css (light + dark
// variants). Rendering uses the `.cal-chip` / `.cal-block` classes, which mix
// the `--evt` custom property into their background and border — so callers
// only need to set `--evt` via `colorVar()` and hover states keep working.
// Kept in sync with COLOR_KEYS in server/routes/todos.ts.

export const EVENT_COLORS = [
  'rose', 'amber', 'emerald', 'sky', 'violet', 'fuchsia', 'teal', 'orange',
] as const

export type EventColor = (typeof EVENT_COLORS)[number]

function isValid(key: string | null | undefined): key is EventColor {
  return !!key && (EVENT_COLORS as readonly string[]).includes(key)
}

/**
 * Inline style setting the `--evt` custom property for an item.
 * `null`/unknown → the theme accent, which preserves the original look.
 */
export function colorVar(key: string | null | undefined): Record<string, string> {
  return { '--evt': isValid(key) ? `var(--evt-${key})` : 'var(--color-accent)' }
}

/** Solid colour for a swatch preview in the picker UI. */
export function swatchColor(key: string | null | undefined): string {
  return isValid(key) ? `var(--evt-${key})` : 'var(--color-accent)'
}
