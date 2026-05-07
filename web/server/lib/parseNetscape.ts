/**
 * Netscape Bookmark File parser — the de-facto export format used by Chrome,
 * Firefox, Edge, Safari, Brave, Vivaldi, Raindrop, Pinboard, etc.
 *
 * The format is HTML-ish with <DL>/<DT>/<H3>/<A> tags arranged as:
 *
 *   <DL><p>
 *     <DT><H3>Folder Name</H3>
 *     <DL><p>
 *       <DT><A HREF="https://...">Title</A>
 *     </DL><p>
 *     <DT><A HREF="...">Top-level bookmark</A>
 *   </DL><p>
 *
 * We tokenize the four structural tags (<H3>, <A>, <DL>, </DL>) and walk
 * a folder stack; everything else is ignored. Spec compliance is not the
 * goal — robustness against the slightly-different output of every browser
 * is. The shape check at the top rejects anything that doesn't look like
 * a bookmark file at all.
 */

export interface Bookmark {
  title: string
  url: string
}

export interface Folder {
  name: string
  bookmarks: Bookmark[]
  children: Folder[]
}

export interface ParsedBookmarks {
  rootBookmarks: Bookmark[]
  folders: Folder[]
}

export class InvalidNetscapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidNetscapeError'
  }
}

const TOKEN_RE =
  /<H3\b[^>]*>([\s\S]*?)<\/H3>|<A\b[^>]*\bHREF\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/A>|<DL\b[^>]*>|<\/DL\s*>/gi

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

export function parseNetscape(html: string): ParsedBookmarks {
  if (!/<DL\b/i.test(html) || !/<A\b[^>]*\bHREF\s*=/i.test(html)) {
    throw new InvalidNetscapeError(
      'Not a Netscape bookmark file (missing <DL> or <A HREF>)'
    )
  }

  const root: Folder = { name: '__root__', bookmarks: [], children: [] }
  const stack: Folder[] = [root]
  let pendingFolder: Folder | null = null

  TOKEN_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN_RE.exec(html)) !== null) {
    if (m[1] !== undefined) {
      pendingFolder = {
        name: decodeEntities(m[1]).trim() || 'Untitled',
        bookmarks: [],
        children: [],
      }
    } else if (m[2] !== undefined) {
      const url = decodeEntities(m[2]).trim()
      if (!url) continue
      const title = decodeEntities(m[3] ?? '').trim() || url
      stack[stack.length - 1].bookmarks.push({ url, title })
    } else if (m[0][1] === '/') {
      // </DL> — pop unless we're at the root
      if (stack.length > 1) stack.pop()
    } else {
      // <DL> — opens the body of the most recently seen <H3>, if any.
      // The first <DL> in the file has no pending folder and is implicitly
      // the root container, which is already on the stack.
      if (pendingFolder) {
        stack[stack.length - 1].children.push(pendingFolder)
        stack.push(pendingFolder)
        pendingFolder = null
      }
    }
  }

  return { rootBookmarks: root.bookmarks, folders: root.children }
}
