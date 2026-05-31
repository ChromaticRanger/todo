import MarkdownIt from 'markdown-it'

// Single shared instance — cheap to reuse, and configuring once means every
// caller renders notes consistently. html:false disables raw <script>/<img>
// injection; linkify auto-detects bare URLs so users don't have to type
// [link](url) syntax for the common case.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
})

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

/**
 * Render a note's markdown body to safe HTML. Pass the raw description
 * straight from the todos table — the renderer handles the rest.
 *
 * Safe to bind to `v-html`: html:false above means embedded `<script>` or
 * `<iframe>` tags from the source are escaped, not executed.
 */
export function renderMarkdown(source: string): string {
  if (!source) return ''
  return md.render(source)
}
