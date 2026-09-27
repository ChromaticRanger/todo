# Docs

Planning and reference material for Stash Squirrel. Nothing in here is read by
the application at runtime or at build time.

| File | What it is |
|---|---|
| [`roadmap.md`](roadmap.md) | What's shipped, what's left, and why. Start here. |
| [`FEATURES.md`](FEATURES.md) | Every user-facing feature and the account level it needs. |
| [`seo-and-spa-notes.md`](seo-and-spa-notes.md) | Why the marketing page is client-rendered and what that costs. |
| [`browser-extension-plan.md`](browser-extension-plan.md) | Design notes for the Chrome extension. |
| [`chrome-web-store-listing.md`](chrome-web-store-listing.md) | Store listing copy. |
| [`social-profiles.md`](social-profiles.md) | Shared marketing assets and handles. |

## Why these live at the repository root

They used to sit in `web/docs/`, next to the code they describe, which is the
more obvious home. They were moved out on 2026-09-27 because of how the app
deploys.

The DigitalOcean app spec sets `source_dir: web` and `deploy_on_push: true`, so
a push to `main` that touches anything under `web/` rebuilds and redeploys the
application — roughly three minutes and a restart of both instances. That was
happening for markdown edits: commit `4552bca`, a roadmap-only change, took a
full deployment.

Moving the docs above `source_dir` is the fix. **If you move them back inside
`web/`, every documentation edit starts rebuilding production again.**

Two things worth knowing if you revisit this:

- The docs were deliberately **not** added to `.gitignore`, which was the other
  option considered. They were already tracked, so ignoring them would have
  needed `git rm --cached` and dropped them from every other clone — and it
  would have cost PR review and `git blame` on exactly the documents whose
  going stale had caused trouble twice that day. Documentation kept outside
  version control drifts faster, not slower.
- If a docs-only push ever *does* trigger a deployment, `source_dir` does not
  scope the autodeploy trigger after all. The fallback is setting
  `deploy_on_push: false` and deploying explicitly with
  `doctl apps create-deployment <app-id>` — at the cost of a manual step before
  every release.

## Related things that are not in here

- `web/README.md` — running the app locally.
- `web/.env.example` — every environment variable, with notes.
- `server/migrations/*.sql` — each migration opens with a comment explaining
  why it exists. **Migrations are never run automatically**; a deploy that
  needs one requires `npm run migrate:prod` by hand.
