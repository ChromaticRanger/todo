# Chrome Web Store listing — Stash Squirrel extension

Copy-paste content for the Chrome Web Store developer console. Each section maps directly to a field in the submission form.

## Short description

≤132 chars. Currently 118.

> Save any page to your Stash Squirrel bookmarks in two clicks — pick a list, add a category, done.

## Detailed description

```
Stash Squirrel is a place to keep your todos, bookmarks, and notes — this extension lets you save any page you're viewing straight into one of your Stash Squirrel lists.

How it works:

• Click the Stash Squirrel icon while viewing any page
• Pick a list (or create a new one), optionally add a category and a note
• Hit Save — the page is now in your account, ready to find later

What you need:

• A free Stash Squirrel account at https://stash-squirrel.com
• Click "Connect" in the extension once to link it to your account

What it doesn't do:

• No tracking. The extension only reads the page URL and title when you click Save — it does not monitor your browsing.
• No ads, no analytics, no third-party trackers.
• Your data stays in your account, on UK-hosted infrastructure.

For the full experience — searching across everything you've saved, organising into lists and categories, scheduling todos, importing existing bookmarks — sign in to https://stash-squirrel.com.

Privacy policy: https://stash-squirrel.com/privacy
Support: support@stash-squirrel.com
```

## Single-purpose statement

> Saves the current browser page (URL and title) into the signed-in user's Stash Squirrel account.

## Permission justifications

### activeTab

> Used only when the user clicks the extension icon: we read the current tab's URL and page title so they can be saved as a bookmark in the user's Stash Squirrel account. The extension does not read tab contents and does not access tabs the user has not actively chosen to save.

### storage

> Used to store the user's authentication token locally via chrome.storage so the extension can authenticate API requests to stash-squirrel.com without prompting the user to sign in on every click. No browsing data is stored.

### Host permission — `https://stash-squirrel.com/*`

> The extension communicates exclusively with the Stash Squirrel web service at stash-squirrel.com to (a) complete the one-time account connection via a postMessage handshake on the /connect-extension page, and (b) send saved pages to the user's account through the authenticated API. No other hosts are accessed.

### Remote code use

> No. The extension does not load or execute remote code. All JavaScript is bundled in the package.

## Other dev-console fields

| Field | Value |
|---|---|
| Category | Productivity |
| Language | English (United Kingdom) |
| Visibility | Public (or Unlisted for soft-launch) |
| Mature content | No |
| Pricing & distribution | Free |

## Privacy practices tab

The dev console asks whether you collect each of ~10 data categories. For Stash Squirrel, tick:

- **Personally identifiable info** (email)
- **Authentication info** (bearer token)
- **Website content** (URLs and titles users choose to save)

Tick nothing else. Confirm all three boxes:

- Not being sold to third parties
- Not being used for purposes unrelated to core functionality
- Not being used to determine creditworthiness

## Submission gotchas

- First submission goes through manual review; expect 2 days to 2+ weeks. Subsequent updates are usually <24 hours.
- The dev console requires certification that listing accurately represents the product — don't overclaim features.
- Bump `version` in both `extension/package.json` and `extension/manifest.config.ts`, rebuild with `npm run build:prod`, and re-zip with a new filename for every update.

## Pre-submission checklist

- [ ] UK Postbox street address filled into `web/public/privacy.html` (× 2 spots)
- [ ] Web app deployed so `https://stash-squirrel.com/privacy` resolves
- [ ] `web/extension/src/popup/App.vue` line 162 timeout reverted to 800ms (if temporarily extended for screenshots)
- [ ] `npm run build:prod` in `web/extension/` produces a clean `dist/` with no localhost in `manifest.json`
- [ ] Zip created from the *contents* of `dist/` (not the folder itself) — manifest.json must be at the zip root
- [ ] Screenshots ready (1280×800 or 640×400, 1–5 of them)
- [ ] Listing copy and justifications above pasted into the dev console
- [ ] Privacy policy URL pasted: `https://stash-squirrel.com/privacy`
- [ ] Trader status declared with UK Postbox address
