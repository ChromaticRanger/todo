# Stash Squirrel — roadmap

Outstanding work captured 2026-05-17. Phases are suggested ordering, not hard commitments. Re-order freely as priorities shift.

## In flight

- **Browser extension registration** (Chrome Web Store). UK Postbox address obtained and `web/public/privacy.html` updated with it. Remaining: deploy → submit. Listing copy ready in `chrome-web-store-listing.md`.

## Phase 1 — Pre-launch must-do

Cannot responsibly open the doors to real users without these.

1. ~~**Database backups**~~ — **Done.** DigitalOcean Managed Postgres provides daily backups + 7-day point-in-time recovery by default; no action needed at present.
2. ~~**Account Details page + delete account**~~ — **Done & tested.** `AccountPage.vue` shows current plan, email, sign-out, and a DELETE-confirmation flow; `account.ts` cancels any Stripe subscription and cascades all user data. Delete flow verified end-to-end against a real account.
3. ~~**Welcome email after account verification**~~ — **Done & verified.** Sent via Resend on email verification (`afterEmailVerification`) and on OAuth signup (user-create hook). Currently links to the app; point it at the FAQ once that exists.

## Phase 2 — Launch enablers

Needed to actually acquire and convert users.

4. **Marketing landing page** — currently `stash-squirrel.com` resolves to the login page. A cold visitor has no idea what the product is. Without this, every acquisition channel (blog, social, ads) leads nowhere. Should sit at `/` for unauthenticated users; the existing login page moves to `/login` or a modal.
5. **Pricing page update** — list all Pro features currently missing from the page. Without an accurate pricing page, even interested users can't justify upgrading.
6. **FAQ / Help section** — reduces support load (which lands in your inbox), helps SEO, builds trust. Can start as a single page with 10–15 questions and grow over time.

## Phase 3 — Onboarding & retention polish

After first users arrive.

7. **Welcome Tour updates** — include the features that have shipped since the tour was written. Onboarding completion correlates strongly with retention.
8. ~~**Admin Console**~~ — **Done.** Admin Dashboard shipped with user list, signup counts, and Pro/comp breakdown. Revisit later if MRR or richer analytics are needed.
13. **More signposting todos in the demo Home/Welcome category** — extend the demo seed (`server/scripts/seed-demo.ts`) with a handful of extra "try this" todos in `Home / Welcome` that walk the demo visitor through specific things: clone a Discover list, snooze a todo, switch theme, drag-reorder categories, complete a recurring item, publish a list to Discover. Cheap to write, multiplies what a casual demo visitor actually sees and tries — direct conversion lift. Pair with #7 (Welcome Tour updates) since the same writing pass can produce both.

## Phase 4 — Trust & defensive

9. **Encryption — largely already in place.** DigitalOcean covers what users actually mean by "is my data encrypted?":
   - In transit (app ↔ DB): TLS, automatic on Managed Postgres
   - At rest (on disk): LUKS full-disk encryption, automatic on Managed Postgres
   - In transit (user ↔ app): HTTPS via the app's TLS cert

   The only thing *not* covered is **application-level field encryption** (data encrypted before it hits the DB, so even the server can't read it). This is rare for bookmark/todo apps because it breaks search, previews, full-text indexing, and discovery features — and most users don't expect it. Standard SaaS practice (Notion, Todoist, Things) is to rely on transit + at-rest encryption and disclose this honestly in the privacy policy.

   **Action**: this item is essentially done. The privacy policy has been updated to disclose what's protected. Only revisit if a real customer asks for application-level encryption — and then push back, because they probably don't realise the trade-offs.

15. **Admin moderation for Discover lists** — currently any Pro user can publish anything to Discover, with no review queue and no admin-side way to take a submitted list down. Add an `is_hidden BOOLEAN DEFAULT FALSE` column on `shared_lists`; the public browse query filters `is_hidden = FALSE`. Extend the Admin Dashboard with a "Recent Discover submissions" panel — sortable, with hide/restore/delete actions per row. ~1 day. Covers ~90% of real moderation needs at current scale. **Pre-launch must-do**: open the doors with at least the ability to take a published list down. Pair with #16.

16. **User-facing report button on Discover** — on each Discover list card and detail view, a small "Report" link that opens a one-field dialog (optional reason). Submission creates a row in a new `shared_list_reports` table: `(id, shared_list_id, reporter_user_id, reason, created_at, resolved_at, resolved_by)`. Admin Dashboard surfaces a "Open reports" badge + panel that lets the admin resolve (hide the list via #15, or dismiss the report). Lets the community do the spotting so the admin only spends time on flagged content. ~half a day on top of #15.

## Phase 5 — Growth

10. **Blog section** — slow-burn SEO + a place to post product updates. Doesn't need to be elaborate — a markdown-rendered route at `/blog` with file-based posts in the repo is enough. Stripe/Linear/Plausible all run their blogs this way.
11. **Discovery content** — more Topic and Todo lists like the Household Chores one. Quick wins for engagement.

## Phase 6 — Existing-feature polish

14. **Markdown support for notes** — let users write notes in Markdown and toggle between rendered and raw views. Headings, lists, bold/italic, links, code blocks, blockquotes. A two-button toggle (Edit / Preview) inside the note item, or live split-pane on wider viewports. Server-side: notes already store free-form text; no schema change needed. Frontend: pick a small Markdown renderer (e.g. `marked` + DOMPurify, or `markdown-it`). Keep the existing plain-text path as a fallback for notes that don't look like Markdown. Modest scope, big quality-of-life win for power users — notes become a real second-brain surface rather than a comment box.

## Phase 7 — Speculative features

12. **New item types**: Clock, Pomodoro Timer, RSS Feed, Stock Quotes, Currency Converter, Calculator. Each is its own design and engineering project; some (RSS, stocks) bring ongoing infrastructure cost. Defer until you know which ones actual users ask for — building all of these speculatively risks bloating the product without raising retention.

---

## Suggested order, condensed

The shortest path to "real customers using a defensible product":

1. Finish extension registration (in flight — deploy + submit)
2. ~~Database backups~~ — covered by DO defaults; no action needed
3. ~~Account deletion / GDPR~~ — done & tested
4. ~~Welcome email~~ — done & verified
5. Marketing landing page
6. Pricing page update
7. FAQ
7a. Discover moderation — admin hide/delete (item 15) + user report button (item 16). The doors shouldn't open without at least the ability to take a submission down.
8. — *Launch publicly* —
9. Welcome Tour update — pair with extra demo signposting todos (item 13) in the same content pass
10. ~~Basic admin visibility~~ — Admin Dashboard shipped
11. ~~Encryption~~ — already covered by DO (transit + at-rest); no app-level work unless a customer specifically asks
12. Markdown notes (item 14) — modest scope, real second-brain upgrade for power users
13. Blog
14. More Discovery content
15. New item types (only the ones users ask for)

## Things worth discussing before starting any of them

- **Marketing page**: this is design-heavy work. Worth thinking about messaging and target audience before writing code — who is Stash Squirrel *for*?
- **Admin console**: how much is enough? A 50-line read-only stats page covers 90% of the value of a full admin app.
- **New item types**: cheap to *say* yes to all, expensive to maintain. Pick favourites.
