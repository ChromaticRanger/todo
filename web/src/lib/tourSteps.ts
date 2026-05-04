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
  /** If set, the step is only included for users on this tier. */
  requiresTier?: 'pro'
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
    id: 'category',
    title: 'Categories',
    body:
      "Categories group related items inside a list. Drag the header to " +
      "reorder, or right-click empty space to add a new one.",
    targetKind: 'category',
    placement: 'auto',
  },
  {
    id: 'todo',
    title: 'Todos',
    body:
      "Todos are the things to do. Click the checkbox to complete one, " +
      "click the title to edit, or set a due date to make it appear in " +
      "Today / Week / Overdue views.",
    targetKind: 'todo',
    placement: 'auto',
  },
  {
    id: 'bookmark',
    title: 'Bookmarks',
    body:
      "Bookmarks store links you want to come back to. The favicon is " +
      "fetched automatically. Click the tile to open the URL in a new tab.",
    targetKind: 'bookmark',
    placement: 'auto',
  },
  {
    id: 'note',
    title: 'Notes',
    body:
      "Notes hold longer text — meeting jottings, recipes, anything that " +
      "isn't a task or a link. They sit alongside todos and bookmarks in " +
      "the same categories.",
    targetKind: 'note',
    placement: 'auto',
  },
  {
    id: 'schedule',
    title: 'Overall Schedule',
    body:
      "Pro accounts get a calendar view that pulls every dated todo from " +
      "every list into one place — handy for spotting clashes and planning " +
      "your week.",
    target: '[data-tour="schedule"]',
    placement: 'bottom',
    requiresTier: 'pro',
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
