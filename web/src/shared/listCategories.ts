// Paired with server/sharedCategories.ts — keep them in sync.
export const LIST_CATEGORIES = [
  'Sports & Fitness',
  'Food & Drink',
  'Travel',
  'Entertainment',
  'Technology',
  'Education',
  'Home & Lifestyle',
  'Money & Finance',
  'News & Media',
  'Health & Wellness',
  'Hobbies & Crafts',
  'Other',
] as const

export type ListCategory = (typeof LIST_CATEGORIES)[number]

export function isListCategory(s: unknown): s is ListCategory {
  return typeof s === 'string' && (LIST_CATEGORIES as readonly string[]).includes(s)
}
