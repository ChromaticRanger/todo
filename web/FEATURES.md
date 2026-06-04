# Stash Squirrel — Feature List

A complete reference of the application's features, the account level each one requires, and what it does.

**Account levels:** **Free** features are available to everyone with an account. **Pro** features require a paid (or comped) subscription. Demo accounts are granted Pro-level access for the length of the trial.

## Free plan at a glance

The Free plan includes all core task management, but caps usage at **3 lists** and **50 items** total, and excludes the calendar, search, Discover, events, and bookmark import (all Pro).

---

## Accounts & Authentication

| Feature | Account Level | Description |
|---|---|---|
| Sign up / Sign in | Free | Email-and-password account creation and login, built on Better Auth with secure password hashing and persistent sessions. |
| Email verification | Free | New accounts must verify their email address; verification status is shown on the account page. |
| Account management | Free | View and update your profile (name, email), see account creation date and tier, and sign out. |
| Account deletion | Free | Permanently delete your account, cascading to all of your todos, lists, and settings. |
| Plan selection | Free | Choose between Free and Pro after sign-up, with monthly or annual Pro subscription options. |
| Stripe billing & portal | Pro | Manage your subscription, payment method, and invoices through the Stripe billing portal; Pro status updates automatically via webhook. |
| Upgrade to Pro | Free | Upgrade from the account page at any time to unlock all Pro features and remove usage caps. |
| Demo accounts | Free | Try the app instantly with a time-limited (30-minute) demo account, pre-seeded with template content and granted Pro-level access. Optionally keep your demo work when you sign up. |

---

## Task & Item Management

| Feature | Account Level | Description |
|---|---|---|
| Create todos | Free | Add tasks with a title and optional description, assigned to a list and category. |
| Edit & delete todos | Free | Update any field of a task (title, description, category, priority, due date) or remove it. |
| Priority levels | Free | Mark items as Low, Medium, or High priority. |
| Due dates & times | Free | Set a specific due date and time-of-day for any item; the exact stored time is always honoured. |
| Complete / uncomplete | Free | Mark tasks done (with a completion timestamp) and undo completion to restore them. |
| Recurring todos | Free | Repeat tasks daily, weekly, fortnightly, monthly, yearly, or on a custom interval; the next occurrence spawns automatically on completion. |
| Snooze / defer | Free | Hide a task (or a whole overdue list) until a chosen future date, with optional rescheduling, and unsnooze to bring it back. |
| Move between lists & categories | Free | Move an item to a different list or category, creating new lists/categories on the fly (subject to Free plan caps). |
| Bookmarks | Free | Save URLs as bookmark items with an automatically fetched favicon thumbnail; supports categories and priorities like todos. |
| Notes (Markdown) | Free | Write notes with full Markdown formatting — headings, bold/italic, lists, code blocks, links, and embedded images — rendered safely with auto-linked URLs. |
| Events | Pro | Create calendar events with a start time and duration (time blocks), including weekly/monthly/yearly recurring series with an optional end date. |

---

## Lists & Categories

| Feature | Account Level | Description |
|---|---|---|
| Lists | Free | Organise items into separate lists, shown as switchable tabs. **Free is limited to 3 lists; Pro is unlimited.** |
| Rename / delete lists | Free | Rename a list or delete it along with all of its contents. |
| Reorder lists | Free | Drag list tabs to reorder them. |
| Categories | Free | Group items into categories within each list; categories are created automatically from items or added manually for planning. |
| Rename / merge / delete categories | Free | Rename a category (bulk-moving its items), merge one category into another, or delete a category and its items. |
| Reorder categories | Free | Drag-and-drop to reorder categories within a list. |
| Item & list caps | Free | The Free plan is capped at 3 lists and 50 items total; a warning banner appears as you approach the limits. **Pro removes both caps.** |

---

## Views & Layout

| Feature | Account Level | Description |
|---|---|---|
| All view | Free | The default view showing all pending items grouped by category. |
| Today / Week / Month views | Free | Time-windowed views showing items due today, this week, or in the next 30 days. |
| Overdue view | Free | Shows past-due pending tasks that need attention. |
| Completed view | Free | Browse completed items over a selectable time window (last 7 / 30 / 90 days, 1 year, or all time). |
| View counts | Free | Badge indicators show how many items fall into each time-windowed view, updating live. |
| Grid layout | Free | Display a list as a responsive grid with a user-selectable column count (2–5). |
| Kanban layout | Free | Display a list as a horizontal carousel of draggable category columns. |
| Per-list layout preferences | Free | Each list remembers its own layout (grid or kanban) and column count. |
| Drag & drop | Free | Reorder items within a category, move items between categories, and reorder categories and list tabs. |
| Overall Schedule (calendar) | Pro | A full month/week calendar with a 24-hour grid, time-block rendering for events, drag-to-create, colour-coding by list, and navigation across weeks and months. |

---

## Search & Discovery

| Feature | Account Level | Description |
|---|---|---|
| Global search | Pro | Press Cmd/Ctrl+K to search across everything you've saved (titles, descriptions, URLs), with relevance-ranked results that jump to and highlight the matching item. |
| Publish lists to Discover | Pro | Share a list to the community catalogue with a custom name, description, emoji, and category. |
| Discover view | Pro | Browse community-published lists, filter by category, search by publisher, and preview list contents. |
| Clone published lists | Pro | Copy a published list into your own workspace, auto-renaming on conflict and rescheduling recurring items to avoid being overdue. |

---

## Import & Integrations

| Feature | Account Level | Description |
|---|---|---|
| Bookmark import | Pro | Upload an HTML bookmarks export from your browser, preview the folder structure and duplicates, map folders to lists, and bulk-import (5 MB limit). |
| Browser extension | Free | Connect the companion browser extension via a securely minted session token to capture bookmarks and tasks from your browser. |
| Welcome email | Free | Receive a welcome email when you select the Free plan. |

---

## Settings & Personalisation

| Feature | Account Level | Description |
|---|---|---|
| Themes | Free | Choose from several colour themes (midnight, slate, forest, sunset, rose, mono). |
| Light / dark mode | Free | Toggle between light and dark appearance, persisted to your account. |
| Completed window preference | Free | Set the default time range used by the Completed view. |
| Calendar view preference | Free | Remember whether the calendar opens in month or week view. |
| Onboarding tour | Free | An interactive welcome tour highlights key UI features on first visit, and can be replayed later. |
| Keyboard shortcuts | Free | Quick keys for new todo (Alt+T), bookmark (Alt+B), note (Alt+N), search (Cmd/Ctrl+K, Pro), and Escape to close dialogs. |

---

## Other

| Feature | Account Level | Description |
|---|---|---|
| Responsive / mobile layout | Free | Layouts adapt from a single column on mobile up to multi-column on desktop, with touch-friendly controls. |
| Toast notifications | Free | In-app messages surface errors, rate-limit notices, and Free-plan cap warnings. |
| Admin dashboard | Admin | Restricted admin area with user statistics, search, tier filtering, and per-user details (access limited to designated admin emails). |
