export type TourTargetKind = 'todo' | 'note' | 'bookmark' | 'category'
export type TourPlacement = 'auto' | 'top' | 'right' | 'bottom' | 'left' | 'center'

export interface TourStep {
  id: string
  title: string
  body: string
  /** CSS selector for stable region steps (header parts, tabs, switcher, etc.). */
  target?: string
  /** For item-example steps — picks the first matching `[data-item-type="..."]`. */
  targetKind?: TourTargetKind
  placement?: TourPlacement
  /**
   * Restricts the step to one tier. Omit it and everyone sees the step.
   *
   * This exists because the Pro controls are `v-if`'d out of the DOM entirely
   * for free accounts (see AppHeader.vue), so a free user's version of a Pro
   * step would have nothing to anchor to and would float in the middle of the
   * screen. Instead the two tiers get different steps in the same slot: Pro
   * users get one step per feature, anchored on the real control; free users
   * get a single honest summary anchored on the Upgrade button.
   */
  tier?: 'free' | 'pro'
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Stash Squirrel',
    body:
      "Your nest for todos, bookmarks, and notes — all in one place. " +
      "We'll take a quick tour of the main features. You can skip at any time " +
      "and replay this tour later from the help button in the header.",
    placement: 'center',
  },
  {
    id: 'lists',
    title: 'Lists',
    body:
      "Lists are separate spaces for whatever you want to keep apart — " +
      "Home, Work, a project, a trip. Click a tab to switch lists, or hit " +
      "+ New list to add one.",
    target: '[data-tour="list-tabs"]',
    placement: 'bottom',
  },
  {
    id: 'add',
    title: 'Add anything',
    body:
      "The Add button creates a new todo, bookmark, or note in the current " +
      "list. Keyboard shortcuts: Alt+T for a todo, Alt+B for a bookmark, " +
      "Alt+N for a note.",
    target: '[data-tour="add-buttons"]',
    placement: 'bottom',
  },
  {
    id: 'views',
    title: 'Filter views',
    body:
      "Switch between All, Today, Week, Month, Overdue, and Completed to " +
      "focus on what's due. A dot beside a view means there are items in it.",
    target: '[data-tour="view-switcher"]',
    placement: 'bottom',
  },
  {
    id: 'layout',
    title: 'Layout',
    body:
      "Toggle between a grid (2–5 columns) and a kanban-style board where " +
      "categories become columns. Each list remembers its own layout.",
    target: '[data-tour="layout-controls"]',
    placement: 'left',
  },
  {
    // One step rather than four. Categories, todos, bookmarks and notes used to
    // get a step each, which meant four consecutive popovers about the same
    // screen before anyone reached the features they'd actually pay for.
    id: 'items',
    title: 'What goes in a list',
    body:
      "A list holds three kinds of thing, side by side: todos to tick off, " +
      "bookmarks that fetch their own favicon, and notes for longer text. " +
      "Categories group them — drag a header to reorder, or right-click " +
      "empty space to add one.",
    targetKind: 'category',
    placement: 'auto',
  },

  // ── Pro: one step per feature, anchored on the control itself ─────────────
  {
    id: 'schedule',
    title: 'Overall Schedule',
    body:
      "Every dated item from every list, on one calendar. Switch between " +
      "month and week, drag to move something, or right-click a slot to " +
      "create an event there.",
    target: '[data-tour="schedule"]',
    placement: 'bottom',
    tier: 'pro',
  },
  {
    id: 'search',
    title: 'Search everything',
    body:
      "Ctrl/⌘K searches every list at once — titles, descriptions and URLs " +
      "across todos, bookmarks, notes and events. Pick a result to jump " +
      "straight to it.",
    target: '[data-tour="search"]',
    placement: 'bottom',
    tier: 'pro',
  },
  {
    id: 'discover',
    title: 'Discover',
    body:
      "Browse lists published by other people — packing lists, reading " +
      "lists, project checklists — and clone any of them into your own " +
      "account in a click. Like the ones you find useful so others spot " +
      "them too.",
    target: '[data-tour="discover"]',
    placement: 'bottom',
    tier: 'pro',
  },
  {
    // Anchored on the tab strip rather than the share icon itself: that icon
    // is opacity-0 until you hover the tab, so highlighting it would spotlight
    // something invisible.
    id: 'sharing',
    title: 'Share a list',
    body:
      "Hover a list tab and you'll find icons to share it or publish it. " +
      "Sharing invites someone by email to the same live list — they can " +
      "view it, or add and edit items alongside you.",
    target: '[data-tour="list-tabs"]',
    placement: 'bottom',
    tier: 'pro',
  },

  // ── Free: the same slot, one honest summary ───────────────────────────────
  {
    id: 'pro-preview',
    title: "What's in Pro",
    body:
      "You're on the free plan, which covers 3 lists and 50 items. Pro " +
      "removes both caps and adds the Overall Schedule calendar, search " +
      "across every list, Discover for cloning other people's lists, " +
      "sharing a list with someone, and bookmark import from your browser.",
    target: '[data-tour="upgrade"]',
    placement: 'bottom',
    tier: 'free',
  },

  {
    id: 'theme',
    title: 'Theme',
    body:
      "Pick a colour theme and switch between light and dark mode. Your " +
      "choice is saved to your account, so it follows you across devices.",
    target: '[data-tour="theme-picker"]',
    placement: 'bottom',
  },
  {
    id: 'replay',
    title: "That's the tour",
    body:
      "Your account and plan live up here. You can replay this tour " +
      "anytime from the help button (?) in the header.",
    target: '[data-tour="user-menu"]',
    placement: 'bottom',
  },
]
