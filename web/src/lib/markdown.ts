import MarkdownIt from 'markdown-it'

// html:false escapes raw HTML tags (e.g. a literal <script>/<iframe>/<img> typed
// into a note becomes text, not markup). It does NOT disable markdown-it's own
// image rule, so `![alt](url)` still renders a real <img> — that's handled
// per-instance below. linkify auto-detects bare URLs so users don't have to type
// [link](url) for the common case.
function buildRenderer({ allowImages }: { allowImages: boolean }) {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
  })

  // Discover renders a published note in OTHER users' browsers, so a remote
  // <img> would leak each viewer's IP/UA to the author's host (tracking pixel).
  // Disable the image rule there; `![alt](url)` falls back to plain text.
  if (!allowImages) md.disable('image')

  // Ensure rendered links open safely. The default renderer outputs plain
  // <a href="…">; this wraps it to add target="_blank" rel="noopener nofollow".
  const defaultLinkOpen = md.renderer.rules.link_open
    ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const aIndex = token.attrIndex('target')
    if (aIndex < 0) token.attrPush(['target', '_blank'])
    else token.attrs![aIndex][1] = '_blank'
    const rIndex = token.attrIndex('rel')
    if (rIndex < 0) token.attrPush(['rel', 'noopener nofollow'])
    else token.attrs![rIndex][1] = 'noopener nofollow'
    return defaultLinkOpen(tokens, idx, options, env, self)
  }

  return md
}

// Two shared instances — cheap to reuse, and configuring once keeps rendering
// consistent. Private notes (the owner's own browser) may show images; Discover
// tiles must not.
const mdWithImages = buildRenderer({ allowImages: true })
const mdNoImages = buildRenderer({ allowImages: false })

/**
 * Render a note's markdown body to safe HTML. Pass the raw description
 * straight from the todos table — the renderer handles the rest.
 *
 * Safe to bind to `v-html`: html:false means embedded `<script>`/`<iframe>`
 * tags from the source are escaped, not executed.
 *
 * Set `allowImages: false` for content shown to other users (Discover) so
 * remote images can't be used as tracking pixels.
 */
export function renderMarkdown(
  source: string,
  { allowImages = true }: { allowImages?: boolean } = {},
): string {
  if (!source) return ''
  return (allowImages ? mdWithImages : mdNoImages).render(source)
}
