# Stash Squirrel — roadmap

Outstanding work first captured 2026-05-17; revised 2026-09-28. Phases are suggested ordering, not hard commitments. Re-order freely as priorities shift.

**Nothing is blocking launch.** The last blocker — Discover moderation — shipped 2026-09-27, and the Welcome Tour followed on 2026-09-28. What's left below is ongoing content work, one decided-but-unscheduled improvement (item 18), and deliberately deferred ideas — not a backlog.

## In flight

- **Retiring the GitHub Actions digest cron.** The app now schedules the digest itself (`server/lib/scheduler.ts`); PR #79 removes the `schedule:` block from the workflow, leaving it manual-only. Held back until a digest is observed sending from the in-process timer — look for `sent: 1` in a `[scheduler] daily digest:` block — then merge and drop `DIGEST_SEND_WINDOW_HOURS` back to 5 on DigitalOcean.

## Phase 1 — Pre-launch must-do

Cannot responsibly open the doors to real users without these.

1. ~~**Database backups**~~ — **Done.** DigitalOcean Managed Postgres provides daily backups + 7-day point-in-time recovery by default; no action needed at present.
2. ~~**Account Details page + delete account**~~ — **Done & tested.** `AccountPage.vue` shows current plan, email, sign-out, and a DELETE-confirmation flow; `account.ts` cancels any Stripe subscription and cascades all user data. Delete flow verified end-to-end against a real account.
3. ~~**Welcome email after account verification**~~ — **Done & verified.** Sent via Resend on email verification (`afterEmailVerification`) and on OAuth signup (user-create hook). Currently links to the app; point it at the FAQ once that exists.

## Phase 2 — Launch enablers

Needed to actually acquire and convert users.

4. ~~**Marketing landing page**~~ — **Done.** `LandingPage.vue` at `/` for unauthenticated visitors with hero, problem/solution, use cases, Discover, features, live demo, and pricing sections. Login moved to `/login`. Deep-link redirects after auth preserved. Refreshed 2026-09-27 with a shared-lists section and a `FeatureShowcase.vue` carousel of real screenshots (derived by `npm run showcase:images`).
5. ~~**Pricing page update**~~ — **Done.** Both `ChoosePlan.vue` (in-app upgrade screen) and the landing page's pricing cards now list every shipped Pro feature: time-block events with recurrence, Month/Week calendar, Discover (browse + clone + publish), global search, bookmark import, higher rate limit, and list sharing. Free caps reconciled with prod (3 lists / 50 items / 1 shared list). **Keep both copies in step — they are near-identical markup in two files.**
6. ~~**FAQ / Help section**~~ — **Done.** A static help centre at `/help`, 35 articles across 10 sections in `src/content/help/`, loaded at build time and rendered from Markdown. Screenshots regenerate with `npm run help:shots`.
17. ~~**Shared lists (collaboration)**~~ — **Done.** Invite by email, viewer/editor roles, live sync over SSE, shared items marked wherever they surface. Sharing is Pro; accepting is free and capped at 1 shared list. Schema in migration `056_list_collaboration.sql`; the share carries the identity, not the list. Covered in `FEATURES.md` and on the landing page.

## Phase 3 — Onboarding & retention polish

After first users arrive.

7. ~~**Welcome Tour updates**~~ — **Done 2026-09-28.** The tour had gone untouched since before shared lists, Discover, global search and bookmark import existed, so of the five things Pro buys it mentioned one — and that one was gated `requiresTier: 'pro'` while its copy read "Pro accounts get a calendar view…", meaning the only upsell in the tour was shown exclusively to people who had already bought.

    The tiers now get different steps in the same slot rather than shared copy, because every Pro control is `v-if`'d out of the DOM for free accounts (`AppHeader.vue`) and a free-tier version of each Pro step would have nothing to anchor to. Free: 9 steps ending in one honest "What's in Pro" signpost anchored on the Upgrade button. Pro: 12 steps, one per feature, each anchored on the real control. `requiresTier` became `tier: 'free' | 'pro'` to allow it. Categories/Todos/Bookmarks/Notes merged into a single step — they were four consecutive popovers about the same screen.

    Bookmark import deliberately has no step of its own: a one-time action would be dead weight on every replay, so it's named in the free summary instead.
8. ~~**Admin Console**~~ — **Done.** Admin Dashboard shipped with user list, signup counts, and Pro/comp breakdown. Revisit later if MRR or richer analytics are needed.
13. ~~**More signposting todos in the demo Home/Welcome category**~~ — **Done (landed in the welcome note instead).** The demo's `Home / Welcome` note (now Markdown — see #14) carries a "What to try" bullet list covering right-click event creation, Month/Week toggle, Discover clone, global search, and category drag-reorder. Reads better as a single welcoming note than as multiple checkbox todos. Publish-to-Discover wasn't included because demo users are blocked from publishing.

## Phase 4 — Trust & defensive

9. **Encryption — largely already in place.** DigitalOcean covers what users actually mean by "is my data encrypted?":
   - In transit (app ↔ DB): TLS, automatic on Managed Postgres
   - At rest (on disk): LUKS full-disk encryption, automatic on Managed Postgres
   - In transit (user ↔ app): HTTPS via the app's TLS cert

   The only thing *not* covered is **application-level field encryption** (data encrypted before it hits the DB, so even the server can't read it). This is rare for bookmark/todo apps because it breaks search, previews, full-text indexing, and discovery features — and most users don't expect it. Standard SaaS practice (Notion, Todoist, Things) is to rely on transit + at-rest encryption and disclose this honestly in the privacy policy.

   **Action**: this item is essentially done. The privacy policy has been updated to disclose what's protected. Only revisit if a real customer asks for application-level encryption — and then push back, because they probably don't realise the trade-offs.

15. ~~**Admin moderation for Discover lists**~~ — **Done 2026-09-27.** Shipped as `is_hidden` (a new column, not a reuse of the vestigial `is_published`) plus hide/restore/remove and a report queue in the Admin Dashboard. Note hiding is the *stronger* takedown: it survives a republish, whereas removing does not stop one. Original plan follows. — currently any Pro user can publish anything to Discover, with no review queue and no admin-side way to take a submitted list down. Add an `is_hidden BOOLEAN DEFAULT FALSE` column on `shared_lists`; the public browse query filters `is_hidden = FALSE`. Extend the Admin Dashboard with a "Recent Discover submissions" panel — sortable, with hide/restore/delete actions per row. ~1 day. Covers ~90% of real moderation needs at current scale. **Pre-launch must-do**: open the doors with at least the ability to take a published list down. Pair with #16.

16. ~~**User-facing report button on Discover**~~ — **Done 2026-09-27.** Preset reason + optional detail, one report per person per list, surfaced in the Admin Dashboard's open-report queue. Original plan follows. — on each Discover list card and detail view, a small "Report" link that opens a one-field dialog (optional reason). Submission creates a row in a new `shared_list_reports` table: `(id, shared_list_id, reporter_user_id, reason, created_at, resolved_at, resolved_by)`. Admin Dashboard surfaces a "Open reports" badge + panel that lets the admin resolve (hide the list via #15, or dismiss the report). Lets the community do the spotting so the admin only spends time on flagged content. ~half a day on top of #15.

## Phase 5 — Growth

10. ~~**Blog section**~~ — **Done.** `/blog`, 12 posts as Markdown in `server/content/blog/`, seeded with `npm run db:seed-blog`. `BlogView.vue` renders images as captioned figures.
11. **Discovery content** — *largely done, ongoing.* 37 curated lists now ship across all 12 categories (`server/migrations/*_seed_*.sql`). Adding more stays a cheap engagement win; no longer a launch dependency.

## Phase 6 — Existing-feature polish

14. ~~**Markdown support for notes**~~ — **Done.** `markdown-it` with `html:false` renders note bodies in display mode; the edit textarea in `TodoForm.vue` stays as raw source. Headings, lists, bold/italic, links (auto-targeted `_blank` with `noopener nofollow`), inline code, code blocks, blockquotes. Styles live in `style.css` under `@layer components .note-markdown` keyed to existing theme tokens (works in light + dark). Same rendering applies to imported notes on Discover via `SharedItemTile.vue`. Demo welcome note rewritten in Markdown to showcase the feature on first run.

## Phase 8 — Post-launch, decided but not scheduled

18. **Todos and notes from the browser extension.** The extension saves bookmarks only —
    `extension/src/lib/api.ts` hardcodes `type: 'bookmark'`. That quietly contradicts the
    product's own pitch: the landing page sells "todos, bookmarks and notes together in one
    list" and the extension does a third of it. Someone who installs it after reading that
    finds a bookmark saver.

    Small: the popup already collects title, list, category and description, which is
    everything a todo or note needs. The work is a type selector, making the URL field
    conditional, and passing the type through.

    One decision it forces — a URL stored on a todo is invisible in the app
    (`TodoItem.vue:155` only opens `todo.url` for bookmarks), so a todo captured from a page
    should put the page URL in its description, unless the app learns to surface URLs on
    todos.

    **Events deliberately excluded**: they need date, time and duration in a 360px popup,
    they are Pro-only so the popup would need plan awareness and an upsell path, and you
    rarely create a calendar event *because of* the page you are on.

    Deferred past launch on purpose. Every extension change needs a Chrome Web Store review
    of several days that cannot be hotfixed, and having one in flight during launch week is
    the wrong risk. Worth its own blog post and announcement when it ships — it is a real
    feature, not a patch.

---

## Phase 7 — Speculative features

12. **New item types**: Clock, Pomodoro Timer, RSS Feed, Stock Quotes, Currency Converter, Calculator. Each is its own design and engineering project; some (RSS, stocks) bring ongoing infrastructure cost. Defer until you know which ones actual users ask for — building all of these speculatively risks bloating the product without raising retention.

---

## Suggested order, condensed

What is actually left, shortest path first:

1. — *Launch publicly* — nothing is blocking it.
2. More Discovery content (item 11) — ongoing, cheap.
3. New item types (item 12) — only the ones users actually ask for.

Everything else is shipped: database backups (DO defaults), account deletion, welcome email, landing page, pricing, help centre, admin dashboard, encryption posture, Markdown notes, blog, browser extension, shared lists, Discover moderation and likes, and the welcome tour.

## Things worth discussing before starting any of them

- **Discover moderation**: how much is enough? A hide flag plus a report queue covers ~90% of real moderation at this scale. Resist building a full review workflow before there is anything to review.
- **New item types**: cheap to *say* yes to all, expensive to maintain. Pick favourites.
- **Anything scheduled**: the app schedules its own jobs now (`server/lib/scheduler.ts`), hourly digest and daily demo cleanup. Don't add a GitHub Actions `schedule:` for periodic work — it delivered 23% of its runs and the failures were silent. Both jobs are idempotent, which is what lets them run safely on every instance.
- **Screenshots go stale**: `public/help-images/` and `public/showcase/` are generated from a live demo session (`npm run help:shots`, then `npm run showcase:images`). A UI change dates them and nothing will tell you.
