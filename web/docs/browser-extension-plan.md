# Stash Squirrel — Browser Extension Plan

A Chrome/Edge (Manifest V3) extension that lets a logged-in Stash Squirrel user
save the page they're viewing as a bookmark, choosing the destination list and
category. Firefox support is a follow-up (same code, minor manifest tweaks).

## Goals (v1)

- Toolbar button opens a popup pre-filled with the active tab's title + URL.
- Popup shows a **List** picker and a **Category** picker (both allow typing a
  new value), an optional notes field, and a **Save** button.
- "Connect to Stash Squirrel" flow that works for *every* signup method
  (email/password, Google, GitHub) without building OAuth into the extension.
- Save = `POST /api/todos` with `type: 'bookmark'`.

## Non-goals (v1, revisit later)

- Right-click context-menu quick-save (uses last-used list/category, skips popup).
- "Recently saved" list / dedupe ("you already saved this").
- Firefox / Safari builds.
- Editing or deleting bookmarks from the extension.

---

## Why we don't authenticate inside the extension

A user who signed up with Google or GitHub has **no password** in Better Auth —
social sign-up creates only a provider `account` row, no `credential` account, so
`/api/auth/sign-in/email` fails for them. Doing the OAuth dance inside an MV3
extension (`chrome.identity.launchWebAuthFlow`, `chromiumapp.org` redirect URIs
registered with Google, Better Auth wanting to set a cookie on its callback) is
fiddly and provider-specific.

Instead we **delegate to the web app**, which already handles all three sign-in
methods. The extension never sees a password or an OAuth token — it gets an
opaque API token minted for an already-authenticated web session. This is the
standard pattern (Pocket, Raindrop, Notion Web Clipper).

### Connect flow

1. Popup (when not yet connected) shows **"Connect to Stash Squirrel"**.
2. Click → `chrome.tabs.create({ url: 'https://stashsquirrel.com/connect-extension?ext=<extensionId>' })`.
3. `/connect-extension` is a normal app route. If not logged in, the app's
   existing auth UI handles it (Google / GitHub / password — nothing new).
4. Once authenticated, the page calls a new endpoint that mints an API token for
   the current user (see below), shows a "You're connected — you can close this
   tab" confirmation.
5. A **content script** declared for `https://stashsquirrel.com/connect-extension*`
   reads the token the page exposes (e.g. via `window.postMessage` or a
   `data-` attribute the page writes) and forwards it with
   `chrome.runtime.sendMessage`. The background service worker stores it in
   `chrome.storage.local`.
6. All subsequent API calls from the extension send `Authorization: Bearer <token>`.

> Security note on step 5: the content script must verify `event.origin` /
> `event.source === window` before trusting the message, and the app page must
> only emit the token after a successful authenticated mint — never echo a token
> from the URL.

### Disconnect

Popup "Disconnect" button → clear `chrome.storage.local` and call a revoke
endpoint (best-effort).

---

## Server changes

All small. Two options for token issuance — pick one:

### Option A — Better Auth Bearer plugin (preferred)

- Add `bearer()` to the `plugins` array in `server/auth.ts`.
- The plugin lets API requests authenticate via `Authorization: Bearer <token>`
  where the token is a session token. `authMiddleware` already calls
  `auth.api.getSession({ headers })`, which the bearer plugin teaches to read the
  header — so **`authMiddleware` may need no change at all**; verify after adding.
- For `/connect-extension`: the page (already cookie-authenticated) calls a tiny
  new server route, e.g. `POST /api/extension/token`, which uses
  `auth.api.getSession` to confirm the session and returns the bearer/session
  token to the page. (Or use whatever the bearer plugin exposes for minting a
  long-lived token.)

### Option B — custom `api_tokens` table

- Migration `021_api_tokens.sql`: `id`, `user_id`, `token_hash`, `name`,
  `created_at`, `last_used_at`, `revoked_at`.
- `POST /api/extension/token` (cookie-auth) → generate random token, store hash,
  return plaintext once.
- Extend `authMiddleware`: if no session cookie but `Authorization: Bearer`
  present, look up the hash, set `req.userId`, bump `last_used_at`.
- `POST /api/extension/revoke` → set `revoked_at`.

Recommendation: **Option A** unless the bearer plugin's token lifetime/refresh
behaviour doesn't fit; Option B is more code but fully under our control.

### Other server notes

- **CORS** already reflects any origin with credentials (`server/index.ts`), so
  `chrome-extension://…` origins work as-is. With bearer auth we don't even need
  credentialed CORS for the extension; can stay as-is.
- **`requirePlan`** returns `402 { error: 'no_plan' }` for a user who never
  picked a plan. An extension-only user could hit this — the popup must catch it
  and say "Finish setup at stashsquirrel.com" with a link. (A brand-new user
  realistically signs up in the web app first, but handle it.)
- **Tier limits**: `POST /api/todos` enforces `LIMITS` (max lists / items for
  free tier). The popup must surface those 4xx errors clearly ("List limit
  reached — upgrade or pick an existing list").
- **`/connect-extension` route**: add to the Vue Router + a view component. No
  server-side rendering needed; it's just another SPA route.

---

## API the extension uses

All under `/api`, all bearer-authenticated:

| Action | Request |
| --- | --- |
| List the user's lists | `GET /api/lists` → `{ lists: string[] }` |
| Categories in a list | `GET /api/categories?list=<name>` → `{ categories: string[] }` |
| Create bookmark | `POST /api/todos` with body `{ list_name, title, description, category, url, type: 'bookmark', priority: 0 }` |
| (connect) mint token | `POST /api/extension/token` (cookie-auth, from `/connect-extension` page) |
| (disconnect) revoke | `POST /api/extension/revoke` |

Notes on the data model:

- A "bookmark" is just a `todos` row with `type = 'bookmark'` and a non-null
  `url` — the server already validates `url` is required for that type.
- There is **no standalone "list" or "category" entity** — both are derived
  `DISTINCT` values over the user's todos. So saving a bookmark with a new
  `list_name` / `category` simply creates them. The pickers should therefore be
  combo-boxes (choose existing *or* type new), and an empty list returns an empty
  `categories` array — that's expected, not an error.
- `GET /api/categories` only returns categories from *incomplete* todos in that
  list; fine for a picker.

---

## Extension structure

Place it in this repo so it can share TypeScript types and styling conventions:

```
web/extension/
  manifest.json
  vite.config.ts            # builds popup + background + content script
  src/
    popup/                  # Vue 3 popup app (reuse Tailwind setup)
      App.vue
      main.ts
    background/
      index.ts              # service worker: token storage, fetch wrapper, (later) context menu
    content/
      connect.ts            # injected on /connect-extension, relays token
    lib/
      api.ts                # typed fetch helpers (mirror server response shapes)
      auth.ts               # get/set/clear token in chrome.storage.local
  public/
    icons/                  # 16/32/48/128 px
```

Build tooling: **Vue 3 + Vite + `@crxjs/vite-plugin`** (handles MV3 manifest,
HMR for the popup, content-script bundling). Add a workspace script, e.g.
`npm run ext:dev` / `npm run ext:build`, or keep the extension's `package.json`
separate to avoid bloating the web app's deps. Reuse the existing Tailwind v4
config where practical.

`manifest.json` essentials:

```jsonc
{
  "manifest_version": 3,
  "name": "Stash Squirrel",
  "version": "0.1.0",
  "action": { "default_popup": "src/popup/index.html" },
  "background": { "service_worker": "src/background/index.ts", "type": "module" },
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["https://stashsquirrel.com/*"],
  "content_scripts": [
    { "matches": ["https://stashsquirrel.com/connect-extension*"], "js": ["src/content/connect.ts"] }
  ]
}
```

(Use `activeTab` rather than broad `<all_urls>` — the popup only needs the
current tab's URL/title when the user clicks the button, which keeps the Web
Store review easy. If context-menu quick-save is added later, that still works
with `activeTab` since it's user-initiated, or add `contextMenus`.)

---

## Popup UX

State machine:

1. **Not connected** → "Connect to Stash Squirrel" button (opens the connect tab).
   Listen for the `connected` message and re-render.
2. **Connected, loading** → fetch `GET /api/lists`; if it 401s, token is stale →
   drop it, go back to state 1. If it 402s (`no_plan`) → "Finish setup" link.
3. **Ready** → form:
   - Title (editable, pre-filled from `tab.title`).
   - URL (read-only, from `tab.url`).
   - List combo-box (existing lists + free text). On change, fetch that list's
     categories.
   - Category combo-box (existing + free text).
   - Notes → goes into `description`.
   - **Save**. On success: show a brief "Saved to <list>" confirmation, then
     close (or keep open with an "open Stash Squirrel" link). On 4xx (limits):
     show the message inline.
4. Remember last-used list + category in `chrome.storage.local` and default to
   them next time.

---

## Build / ship checklist

1. Server: add bearer plugin (Option A), `POST /api/extension/token` +
   `/revoke`, `/connect-extension` SPA route + view. Migration only if Option B.
2. Scaffold `web/extension/` with crxjs + Vue, wire `ext:dev` / `ext:build`.
3. Implement background token store + fetch wrapper; content script for connect.
4. Implement popup state machine + form.
5. Manual test: load unpacked extension, connect with a password account, a
   Google account, and a GitHub account; save bookmarks to existing and new
   lists/categories; verify they appear in the web app; verify 401 (revoke
   token) and 402 (plan-less user) handling.
6. Icons + store listing copy + screenshots. Chrome Web Store: one-time \$5 dev
   fee, then submit for review (~1–3 days typical).
7. Later: Firefox manifest variant (`browser_specific_settings`, MV3 differences),
   context-menu quick-save, recently-saved/dedupe.

## Open questions

- Token lifetime: long-lived bearer token (revocable) vs. short token + refresh.
  Long-lived + revoke list is simpler and fine for v1.
- Domain: confirm production origin to bake into `host_permissions` and the
  connect URL (assumed `https://stashsquirrel.com`).
- Do we want the extension in this monorepo (shared types, one place) or its own
  repo (independent release cadence, smaller checkout)? Plan assumes monorepo.
