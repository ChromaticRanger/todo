# Stash Squirrel — roadmap

Outstanding work captured 2026-05-17. Phases are suggested ordering, not hard commitments. Re-order freely as priorities shift.

## In flight

- **Browser extension registration** (Chrome Web Store). Blocked on UK Postbox address landing → fill placeholders in `web/public/privacy.html` → deploy → submit. Listing copy ready in `chrome-web-store-listing.md`.

## Phase 1 — Pre-launch must-do

Cannot responsibly open the doors to real users without these.

1. **Database backups** — confirm or configure automated backups. DigitalOcean Managed Postgres has daily backups + 7-day point-in-time recovery built in; verify it's switched on for the prod DB. If self-managed Postgres on a droplet, configure `pg_dump` to S3/Spaces nightly + retention policy. Single point of failure with zero recovery = company-ending event for one customer.
2. **Account Details page + delete account** — GDPR right to erasure is a legal requirement, not a feature. Must exist before any public user signs up. Page should also show: current plan, email, sign-out, "delete my account and all data" with a 30-day grace period or immediate hard delete.
3. **Welcome email after account verification** — small, easy, big first-impression win. Sent via Resend (already wired). Short, friendly, links to FAQ once that exists.

## Phase 2 — Launch enablers

Needed to actually acquire and convert users.

4. **Marketing landing page** — currently `stash-squirrel.com` resolves to the login page. A cold visitor has no idea what the product is. Without this, every acquisition channel (blog, social, ads) leads nowhere. Should sit at `/` for unauthenticated users; the existing login page moves to `/login` or a modal.
5. **Pricing page update** — list all Pro features currently missing from the page. Without an accurate pricing page, even interested users can't justify upgrading.
6. **FAQ / Help section** — reduces support load (which lands in your inbox), helps SEO, builds trust. Can start as a single page with 10–15 questions and grow over time.

## Phase 3 — Onboarding & retention polish

After first users arrive.

7. **Welcome Tour updates** — include the features that have shipped since the tour was written. Onboarding completion correlates strongly with retention.
8. **Admin Console** — even a basic version: total users, signups today/week/month, conversion to Pro, current MRR. Lets you tell if marketing efforts are working. Can start as a single read-only page or even a CLI script before becoming a real console.

## Phase 4 — Trust & defensive

9. **Encryption — largely already in place.** DigitalOcean covers what users actually mean by "is my data encrypted?":
   - In transit (app ↔ DB): TLS, automatic on Managed Postgres
   - At rest (on disk): LUKS full-disk encryption, automatic on Managed Postgres
   - In transit (user ↔ app): HTTPS via the app's TLS cert

   The only thing *not* covered is **application-level field encryption** (data encrypted before it hits the DB, so even the server can't read it). This is rare for bookmark/todo apps because it breaks search, previews, full-text indexing, and discovery features — and most users don't expect it. Standard SaaS practice (Notion, Todoist, Things) is to rely on transit + at-rest encryption and disclose this honestly in the privacy policy.

   **Action**: this item is essentially done. The privacy policy has been updated to disclose what's protected. Only revisit if a real customer asks for application-level encryption — and then push back, because they probably don't realise the trade-offs.

## Phase 5 — Growth

10. **Blog section** — slow-burn SEO + a place to post product updates. Doesn't need to be elaborate — a markdown-rendered route at `/blog` with file-based posts in the repo is enough. Stripe/Linear/Plausible all run their blogs this way.
11. **Discovery content** — more Topic and Todo lists like the Household Chores one. Quick wins for engagement.

## Phase 6 — Speculative features

12. **New item types**: Clock, Pomodoro Timer, RSS Feed, Stock Quotes, Currency Converter, Calculator. Each is its own design and engineering project; some (RSS, stocks) bring ongoing infrastructure cost. Defer until you know which ones actual users ask for — building all of these speculatively risks bloating the product without raising retention.

---

## Suggested order, condensed

The shortest path to "real customers using a defensible product":

1. Finish extension registration (in flight)
2. Database backups verified
3. Account deletion / GDPR
4. Welcome email
5. Marketing landing page
6. Pricing page update
7. FAQ
8. — *Launch publicly* —
9. Welcome Tour update
10. Basic admin visibility
11. ~~Encryption~~ — already covered by DO (transit + at-rest); no app-level work unless a customer specifically asks
12. Blog
13. More Discovery content
14. New item types (only the ones users ask for)

## Things worth discussing before starting any of them

- **Marketing page**: this is design-heavy work. Worth thinking about messaging and target audience before writing code — who is Stash Squirrel *for*?
- **Admin console**: how much is enough? A 50-line read-only stats page covers 90% of the value of a full admin app.
- **New item types**: cheap to *say* yes to all, expensive to maintain. Pick favourites.
