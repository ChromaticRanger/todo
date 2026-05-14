# SEO & the SPA — notes

_Captured 2026-05-12. A conversation summary about the site's architecture and how to add SEO._

## Is this site a SPA?

Yes. It's a client-rendered Single Page Application:

- **Vue 3 + Vite** with a plain `index.html` shell. `vite build` outputs static assets into `dist/`, and an Express server (`server/index.ts`) serves those assets plus a JSON API.
- There is **no server-side rendering** — no Nuxt, no `vite-ssr`, no prerender step.
- There isn't even `vue-router` — `App.vue` is the whole app, and it boots straight into the todo app.
- A crawler that requests `/` gets an essentially empty `<div id="app">` plus a JS bundle. The real content (lists, categories, Discover, etc.) is only painted after Vue boots and the API calls resolve.

So for SEO purposes the site is currently a black box to anything that doesn't execute JavaScript. Google *can* render JS, but it's slower, less reliable, and other crawlers (Bing historically, social-card scrapers, LLM crawlers) often won't bother — and you can't do per-page `<title>` / `<meta>` / Open Graph tags without extra work.

Also worth remembering: most of this app is behind auth and **shouldn't** be indexed at all. The SEO question only really applies to the public surface.

## General options for adding SEO to an SPA (increasing effort)

1. **`vue-meta` / `@unhead/vue`** — per-route `<title>` and meta tags, but still set client-side, so only helps JS-executing crawlers. Cheap, partial win.
2. **Prerendering** (`vite-plugin-prerender`, `prerender.io`, or a Puppeteer build step) — generate static HTML snapshots of known public routes at build time. Works well if the SEO-relevant pages are a finite, mostly-static set.
3. **Migrate to SSR** — Nuxt, or Vite's SSR mode. The real fix and the biggest change: the Express server would render Vue to HTML per request. Significant refactor of data loading and auth-gating.
4. **Hybrid** — keep the app as a SPA, but add a few server-rendered/prerendered public pages (marketing + published-list pages).

## The pragmatic plan for *this* site

In practice SEO is only needed for a **marketing-type landing page** — once customers are attracted, they know the domain name anyway. The logged-in todo app itself doesn't want to be in Google.

So: **don't make the marketing page part of the Vue SPA at all.**

- Make the landing page a plain static `marketing.html` (or `landing/index.html`) — hand-written HTML/CSS with a real `<title>`, `<meta name="description">`, Open Graph tags, etc. Serve it as the actual `/` route.
- Its "Sign up" / "Log in" buttons link to `/app` (or wherever), where the Vite SPA mounts.

Why this is the sweet spot:

- The page crawlers/social scrapers/LLM crawlers hit is fully-formed HTML with zero JS dependency — good SEO, good link previews.
- The app stays a no-build-complexity SPA. No SSR, no prerender pipeline, no Nuxt migration.
- No runtime cost — it's a static file.

### Implementation sketch

- Express routing tweak: serve the static marketing file at `/`; serve `dist/index.html` (the SPA shell) at `/app/*`; update the SPA's base path accordingly.
- The marketing page can live in `public/` or its own folder, independent of the Vite build.
- Make sure the marketing HTML is genuinely static (content in the markup, not injected by script).
- Add a canonical URL tag, a `sitemap.xml`, and a `robots.txt` pointing at the landing page. `Disallow` everything under `/app` since it's auth-gated anyway.

### Possible next step

Scaffold a starter static landing page plus the Express changes to serve it at `/` with the app moved under `/app`.
