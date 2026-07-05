<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { apiFetch } from '../lib/api'
import { renderMarkdown } from '../lib/markdown'

// Standalone paper-themed reading experience, matching public/privacy.html.
// No Vue Router in this app (see App.vue) — we read the path once on mount and
// navigate between posts with real <a href> loads.

const SUPPORT_EMAIL = 'support@stash-squirrel.com'

interface Reactions {
  like: number
  love: number
}
interface PostSummary {
  id: number
  slug: string
  title: string
  summary: string
  isPublished: boolean
  publishedAt: string | null
  reactions: Reactions
}
interface PostDetail extends PostSummary {
  body: string
  authorEmail: string
  myReactions: string[]
}
interface Neighbour {
  slug: string
  title: string
}

const mode = ref<'list' | 'detail'>('list')
const loading = ref(true)
const error = ref('')

const posts = ref<PostSummary[]>([])
const post = ref<PostDetail | null>(null)
const bodyHtml = ref('')
const reacting = ref<string | null>(null)
const prevPost = ref<Neighbour | null>(null)
const nextPost = ref<Neighbour | null>(null)

// Path is /blog (list) or /blog/<slug> (detail).
function slugFromPath(): string | null {
  const parts = window.location.pathname.replace(/\/+$/, '').split('/')
  // ['', 'blog'] → list; ['', 'blog', 'my-slug'] → detail
  return parts.length >= 3 && parts[2] ? decodeURIComponent(parts[2]) : null
}

function fmtDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

// markdown-it renders a standalone image as `<p><img ...></p>`. Upgrade those to
// a <figure> and surface the alt text as a caption, so screenshots read as
// intentional figures. This only reshapes the renderer's own (already-escaped,
// html:false) output — no user HTML is introduced, so it stays XSS-safe.
function renderBody(markdown: string): string {
  return renderMarkdown(markdown).replace(
    /<p>\s*(<img\b[^>]*>)\s*<\/p>/g,
    (_full, img: string) => {
      const alt = /\balt="([^"]*)"/.exec(img)?.[1] ?? ''
      const caption = alt ? `<figcaption>${alt}</figcaption>` : ''
      return `<figure class="shot">${img}${caption}</figure>`
    }
  )
}

async function loadList() {
  try {
    const res = await apiFetch('/api/blog')
    if (!res.ok) {
      error.value = `Couldn't load posts (HTTP ${res.status}).`
      return
    }
    posts.value = ((await res.json()) as { posts: PostSummary[] }).posts
  } catch (e) {
    error.value = String(e)
  }
}

async function loadPost(slug: string) {
  try {
    const res = await apiFetch(`/api/blog/${encodeURIComponent(slug)}`)
    if (res.status === 404) {
      error.value = 'This post doesn’t exist (or isn’t published yet).'
      return
    }
    if (!res.ok) {
      error.value = `Couldn't load the post (HTTP ${res.status}).`
      return
    }
    const body = (await res.json()) as {
      post: PostDetail
      neighbours?: { prev: Neighbour | null; next: Neighbour | null }
    }
    post.value = body.post
    prevPost.value = body.neighbours?.prev ?? null
    nextPost.value = body.neighbours?.next ?? null
    bodyHtml.value = renderBody(post.value.body)
  } catch (e) {
    error.value = String(e)
  }
}

async function react(reaction: 'like' | 'love') {
  if (!post.value || reacting.value) return
  reacting.value = reaction
  try {
    const res = await apiFetch(`/api/blog/${encodeURIComponent(post.value.slug)}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction }),
    })
    if (!res.ok) return
    const body = (await res.json()) as { reactions: Reactions; myReactions: string[] }
    post.value.reactions = body.reactions
    post.value.myReactions = body.myReactions
  } catch {
    // Non-fatal — leave the counts as they were.
  } finally {
    reacting.value = null
  }
}

function mine(reaction: string): boolean {
  return !!post.value?.myReactions.includes(reaction)
}

onMounted(async () => {
  // Load the same serif face privacy.html uses, without touching the app shell.
  if (!document.getElementById('blog-fraunces-font')) {
    const link = document.createElement('link')
    link.id = 'blog-fraunces-font'
    link.rel = 'stylesheet'
    link.href =
      'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,400..800,0..100;1,9..144,400..800,0..100&display=swap'
    document.head.appendChild(link)
  }

  const slug = slugFromPath()
  mode.value = slug ? 'detail' : 'list'
  if (slug) await loadPost(slug)
  else await loadList()
  loading.value = false
})
</script>

<template>
  <div class="blog-root">
    <main>
      <header>
        <a class="brand" href="/">
          <img src="/stash-squirrel.svg" alt="" />
          <span>Stash Squirrel</span>
        </a>
        <h1 v-if="mode === 'list'">Blog</h1>
        <p v-if="mode === 'list'" class="lede">
          What we’re building, and what we’re thinking about. We’d love your feedback.
        </p>
      </header>

      <p v-if="loading" class="muted">Loading…</p>
      <p v-else-if="error" class="muted">{{ error }}</p>

      <!-- List -->
      <template v-else-if="mode === 'list'">
        <p v-if="posts.length === 0" class="muted">
          No posts yet — check back soon.
        </p>
        <ul v-else class="post-list">
          <li v-for="p in posts" :key="p.id">
            <a :href="`/blog/${p.slug}`" class="post-link">
              <h2>
                {{ p.title }}
                <span v-if="!p.isPublished" class="draft-tag">Draft</span>
              </h2>
              <p v-if="p.publishedAt" class="post-date">{{ fmtDate(p.publishedAt) }}</p>
              <p v-if="p.summary" class="post-summary">{{ p.summary }}</p>
            </a>
          </li>
        </ul>
      </template>

      <!-- Detail -->
      <template v-else-if="post">
        <h1>
          {{ post.title }}
        </h1>
        <p class="post-date">
          <span v-if="!post.isPublished" class="draft-tag">Draft — only you can see this</span>
          <span v-else-if="post.publishedAt">{{ fmtDate(post.publishedAt) }}</span>
        </p>

        <article class="prose" v-html="bodyHtml"></article>

        <div class="reactions">
          <p class="reactions-label">Enjoyed this? Let us know:</p>
          <div class="reaction-buttons">
            <button
              type="button"
              class="reaction"
              :class="{ active: mine('like') }"
              :disabled="reacting !== null"
              @click="react('like')"
            >
              👍 <span class="count">{{ post.reactions.like }}</span>
            </button>
            <button
              type="button"
              class="reaction"
              :class="{ active: mine('love') }"
              :disabled="reacting !== null"
              @click="react('love')"
            >
              ❤️ <span class="count">{{ post.reactions.love }}</span>
            </button>
          </div>
          <p class="cta">
            Got ideas or feedback? Email
            <a :href="`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Feedback: ' + post.title)}`">
              {{ SUPPORT_EMAIL }}
            </a>.
          </p>
        </div>

        <nav v-if="prevPost || nextPost" class="post-nav">
          <a v-if="prevPost" :href="`/blog/${prevPost.slug}`" class="nav-link prev">
            <span class="nav-dir">&larr; Previous</span>
            <span class="nav-title">{{ prevPost.title }}</span>
          </a>
          <span v-else class="nav-spacer"></span>
          <a v-if="nextPost" :href="`/blog/${nextPost.slug}`" class="nav-link next">
            <span class="nav-dir">Next &rarr;</span>
            <span class="nav-title">{{ nextPost.title }}</span>
          </a>
          <span v-else class="nav-spacer"></span>
        </nav>
      </template>

      <footer>
        <a v-if="mode === 'detail'" href="/blog">&larr; All posts</a>
        <a v-else href="/">&larr; Back to Stash Squirrel</a>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.blog-root {
  --ink: #1f1a17;
  --ink-soft: #4a4039;
  --paper: #fbf8f3;
  --rule: #e7dfd2;
  --accent: #b5651d;
  min-height: 100dvh;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Fraunces', Georgia, 'Times New Roman', serif;
  font-size: 17px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
.blog-root main {
  max-width: 720px;
  margin: 0 auto;
  padding: 56px 24px 96px;
}
.blog-root header {
  border-bottom: 1px solid var(--rule);
  padding-bottom: 24px;
  margin-bottom: 40px;
}
.blog-root a.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--ink);
  font-weight: 600;
  font-size: 18px;
}
.blog-root a.brand img {
  width: 28px;
  height: 28px;
}
.blog-root h1 {
  font-size: 36px;
  line-height: 1.15;
  margin: 24px 0 8px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.blog-root .lede,
.blog-root .post-date {
  color: var(--ink-soft);
  font-size: 15px;
  font-style: italic;
  margin: 0 0 4px;
}
.blog-root .muted {
  color: var(--ink-soft);
}

/* List */
.blog-root .post-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.blog-root .post-list li {
  border-bottom: 1px solid var(--rule);
}
.blog-root .post-link {
  display: block;
  text-decoration: none;
  color: var(--ink);
  padding: 24px 0;
}
.blog-root .post-link:hover h2 {
  color: var(--accent);
}
.blog-root .post-list h2 {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 4px;
  letter-spacing: -0.005em;
  transition: color 0.15s;
}
.blog-root .post-summary {
  margin: 6px 0 0;
  color: var(--ink-soft);
}
.blog-root .draft-tag {
  display: inline-block;
  vertical-align: middle;
  margin-left: 8px;
  font-size: 12px;
  font-style: normal;
  font-weight: 600;
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 1px 8px;
}

/* Article body (rendered markdown) */
.blog-root .prose {
  margin-top: 32px;
}
.blog-root .prose :deep(h2) {
  font-size: 22px;
  margin: 40px 0 12px;
  font-weight: 600;
  letter-spacing: -0.005em;
}
.blog-root .prose :deep(h3) {
  font-size: 18px;
  margin: 28px 0 8px;
  font-weight: 600;
}
.blog-root .prose :deep(p),
.blog-root .prose :deep(ul),
.blog-root .prose :deep(ol),
.blog-root .prose :deep(blockquote) {
  margin: 0 0 16px;
}
.blog-root .prose :deep(ul),
.blog-root .prose :deep(ol) {
  padding-left: 22px;
}
.blog-root .prose :deep(li) {
  margin-bottom: 6px;
}
.blog-root .prose :deep(a) {
  color: var(--accent);
}
.blog-root .prose :deep(blockquote) {
  border-left: 3px solid var(--rule);
  padding-left: 16px;
  color: var(--ink-soft);
  font-style: italic;
}
.blog-root .prose :deep(figure) {
  margin: 28px 0;
}
.blog-root .prose :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  border: 1px solid var(--rule);
  border-radius: 8px;
  background: #fff;
}
/* Screenshots get a soft lift off the paper; inline images stay flat. */
.blog-root .prose :deep(figure.shot img) {
  box-shadow: 0 1px 2px rgba(31, 26, 23, 0.08), 0 10px 28px rgba(31, 26, 23, 0.07);
}
.blog-root .prose :deep(figcaption) {
  margin-top: 10px;
  text-align: center;
  font-size: 14px;
  font-style: italic;
  color: var(--ink-soft);
}
.blog-root .prose :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  background: #fff;
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 1px 5px;
}
.blog-root .prose :deep(pre) {
  background: #fff;
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 0 0 16px;
}
.blog-root .prose :deep(pre code) {
  border: 0;
  padding: 0;
  background: transparent;
}

/* Reactions */
.blog-root .reactions {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid var(--rule);
}
.blog-root .reactions-label {
  margin: 0 0 12px;
  color: var(--ink-soft);
  font-size: 15px;
}
.blog-root .reaction-buttons {
  display: flex;
  gap: 10px;
}
.blog-root .reaction {
  font: inherit;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--rule);
  border-radius: 999px;
  padding: 6px 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: border-color 0.15s, background 0.15s;
}
.blog-root .reaction:hover:not(:disabled) {
  border-color: var(--accent);
}
.blog-root .reaction:disabled {
  opacity: 0.6;
  cursor: default;
}
.blog-root .reaction.active {
  border-color: var(--accent);
  background: #fdf1e5;
}
.blog-root .reaction .count {
  font-variant-numeric: tabular-nums;
  color: var(--ink-soft);
}
.blog-root .cta {
  margin: 20px 0 0;
  color: var(--ink-soft);
  font-size: 15px;
}
.blog-root .cta a {
  color: var(--accent);
}

/* Previous / next post navigation */
.blog-root .post-nav {
  display: flex;
  gap: 16px;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--rule);
}
.blog-root .nav-link {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-decoration: none;
  color: var(--ink);
  flex: 1 1 0;
  max-width: 50%;
}
.blog-root .nav-link.next {
  text-align: right;
  align-items: flex-end;
}
.blog-root .nav-spacer {
  flex: 1 1 0;
}
.blog-root .nav-dir {
  font-size: 13px;
  font-style: italic;
  color: var(--ink-soft);
}
.blog-root .nav-title {
  font-weight: 600;
  letter-spacing: -0.005em;
}
.blog-root .nav-link:hover .nav-title {
  color: var(--accent);
}

/* Footer */
.blog-root footer {
  margin-top: 64px;
  padding-top: 24px;
  border-top: 1px solid var(--rule);
  color: var(--ink-soft);
  font-size: 14px;
}
.blog-root footer a {
  color: var(--ink-soft);
}
</style>
