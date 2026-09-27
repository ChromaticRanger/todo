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
more obvious home. They were moved out on 2026-09-27 in an attempt to stop
documentation edits redeploying the application.

**It didn't work, and the position is worth recording so nobody tries it
again.** The DigitalOcean app spec sets `source_dir: web` and
`deploy_on_push: true`. `source_dir` scopes the *build context* — it does not
scope the *autodeploy trigger*. Any push to `main` redeploys the app
regardless of which paths changed. Commit `d09c15b` touched only
`docs/README.md` and still produced a full deployment, which is what settled
it.

So the docs being up here buys nothing functionally. They stay because moving
them back is churn for its own sake, not because it helps.

The rebuild itself was judged acceptable rather than worth engineering around:
roughly three minutes, rolling across two instances, no downtime and no extra
cost, for documents that change rarely. The alternatives, if that ever stops
being true:

- **Gate deploys through GitHub Actions.** Set `deploy_on_push: false` and add
  a push-triggered workflow with `paths-ignore` for `docs/**` that calls
  `doctl apps create-deployment`. Automatic for code, silent for docs. Costs a
  write-scoped DigitalOcean token in repository secrets and introduces a way
  for a deploy to silently not happen. (Note this is *not* the same trap as the
  daily digest: GitHub drops **scheduled** workflows, not push-triggered ones.)
- **Turn autodeploy off entirely** and run `doctl apps create-deployment
  <app-id>` by hand. No new secrets, but it puts a forgettable manual step in
  front of every release.

One option that was considered and rejected: adding the docs to `.gitignore`.
They were already tracked, so ignoring them would have needed `git rm --cached`
and dropped them from every other clone — and it would have cost PR review and
`git blame` on exactly the documents whose going stale had caused trouble twice
that day. Documentation kept outside version control drifts faster, not
slower.

## Related things that are not in here

- `web/README.md` — running the app locally.
- `web/.env.example` — every environment variable, with notes.
- `server/migrations/*.sql` — each migration opens with a comment explaining
  why it exists. **Migrations are never run automatically**; a deploy that
  needs one requires `npm run migrate:prod` by hand.
