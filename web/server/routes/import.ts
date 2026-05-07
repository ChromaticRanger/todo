import { Router, type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import crypto from 'crypto'
import { pool, query } from '../db.js'
import {
  parseNetscape,
  InvalidNetscapeError,
  type ParsedBookmarks,
  type Folder,
} from '../lib/parseNetscape.js'
import { normalizeUrl } from '../lib/url.js'

const router = Router()

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_BOOKMARKS = 5000
const CACHE_TTL_MS = 10 * 60 * 1000
const FOLDER_PATH_SEPARATOR = ' › '
const DEFAULT_ROOT_LIST = 'Imported'
const UNCATEGORIZED = 'Uncategorized'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
})

interface CachedImport {
  tree: ParsedBookmarks
  userId: string
  expiresAt: number
}

const importCache = new Map<string, CachedImport>()

const sweep = setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of importCache) {
    if (entry.expiresAt <= now) importCache.delete(id)
  }
}, 60 * 1000)
sweep.unref?.()

interface FlatBookmark {
  url: string
  title: string
  normalizedUrl: string
  /** The top-level folder this bookmark sits under, or null for root bookmarks. */
  topLevelFolder: string | null
  /** Folder names from depth 2 down (excluding the top-level folder). */
  subPath: string[]
}

function flatten(tree: ParsedBookmarks): FlatBookmark[] {
  const out: FlatBookmark[] = []
  for (const b of tree.rootBookmarks) {
    out.push({
      url: b.url,
      title: b.title,
      normalizedUrl: normalizeUrl(b.url),
      topLevelFolder: null,
      subPath: [],
    })
  }
  for (const folder of tree.folders) {
    walk(folder, folder.name, [], out)
  }
  return out
}

function walk(folder: Folder, topLevelName: string, subPath: string[], out: FlatBookmark[]): void {
  for (const b of folder.bookmarks) {
    out.push({
      url: b.url,
      title: b.title,
      normalizedUrl: normalizeUrl(b.url),
      topLevelFolder: topLevelName,
      subPath,
    })
  }
  for (const child of folder.children) {
    walk(child, topLevelName, [...subPath, child.name], out)
  }
}

function categoryFromSubPath(subPath: string[]): string {
  if (subPath.length === 0) return UNCATEGORIZED
  return subPath.join(FOLDER_PATH_SEPARATOR)
}

function uploadSingle(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) return next()
    const e = err as { code?: string; message?: string }
    if (e.code === 'LIMIT_FILE_SIZE') {
      return res
        .status(413)
        .json({ error: 'file_too_large', limit_bytes: MAX_FILE_BYTES })
    }
    if (e.code === 'LIMIT_FILE_COUNT' || e.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: 'invalid_upload', message: e.message })
    }
    return res.status(400).json({ error: 'upload_failed', message: e.message ?? String(err) })
  })
}

// POST /api/import/bookmarks/preview
router.post('/bookmarks/preview', uploadSingle, async (req, res) => {
  if (req.plan !== 'pro') {
    return res.status(403).json({ error: 'pro_required' })
  }
  if (!req.file) {
    return res.status(400).json({ error: 'file_required' })
  }

  const html = req.file.buffer.toString('utf8')

  let tree: ParsedBookmarks
  try {
    tree = parseNetscape(html)
  } catch (err) {
    if (err instanceof InvalidNetscapeError) {
      return res.status(400).json({ error: 'invalid_netscape', message: err.message })
    }
    console.error('[import/preview] parse failed:', err)
    return res.status(500).json({ error: 'parse_failed' })
  }

  const flat = flatten(tree)
  if (flat.length === 0) {
    return res.status(400).json({ error: 'no_bookmarks' })
  }
  if (flat.length > MAX_BOOKMARKS) {
    return res
      .status(400)
      .json({ error: 'too_many_bookmarks', limit: MAX_BOOKMARKS, found: flat.length })
  }

  const userId = req.userId!

  try {
    const listsRes = await query<{ list_name: string }>(
      `SELECT DISTINCT list_name FROM todos
       WHERE user_id = $1 AND list_name <> '__events__'
       ORDER BY list_name`,
      [userId]
    )
    const existingLists = listsRes.rows.map((r) => r.list_name)

    const potentialDests = new Set<string>()
    for (const b of flat) {
      potentialDests.add(b.topLevelFolder ?? DEFAULT_ROOT_LIST)
    }

    const existingPairs = await fetchExistingBookmarkPairs(userId, [...potentialDests])
    const seen = new Set(existingPairs)
    let duplicatesIfDefaults = 0
    for (const b of flat) {
      const list = b.topLevelFolder ?? DEFAULT_ROOT_LIST
      const key = `${list}\t${b.normalizedUrl}`
      if (seen.has(key)) duplicatesIfDefaults++
      else seen.add(key)
    }

    interface FolderSummary {
      name: string
      bookmarkCount: number
      categories: string[]
    }
    const folderMap = new Map<string, FolderSummary>()
    let rootBookmarks = 0
    for (const b of flat) {
      if (b.topLevelFolder == null) {
        rootBookmarks++
        continue
      }
      let s = folderMap.get(b.topLevelFolder)
      if (!s) {
        s = { name: b.topLevelFolder, bookmarkCount: 0, categories: [] }
        folderMap.set(b.topLevelFolder, s)
      }
      s.bookmarkCount++
      const cat = categoryFromSubPath(b.subPath)
      if (!s.categories.includes(cat)) s.categories.push(cat)
    }

    const importId = crypto.randomUUID()
    importCache.set(importId, {
      tree,
      userId,
      expiresAt: Date.now() + CACHE_TTL_MS,
    })

    return res.json({
      importId,
      topLevelFolders: [...folderMap.values()],
      rootBookmarks,
      totals: { parsed: flat.length, duplicatesIfDefaults },
      existingLists,
    })
  } catch (err) {
    console.error('[import/preview] db error:', err)
    return res.status(500).json({ error: 'preview_failed' })
  }
})

async function fetchExistingBookmarkPairs(
  userId: string,
  destLists: string[]
): Promise<string[]> {
  if (destLists.length === 0) return []
  const result = await query<{ list_name: string; url: string }>(
    `SELECT list_name, url FROM todos
     WHERE user_id = $1
       AND type = 'bookmark'
       AND url IS NOT NULL
       AND list_name = ANY($2::text[])`,
    [userId, destLists]
  )
  return result.rows.map((r) => `${r.list_name}\t${normalizeUrl(r.url)}`)
}

interface FolderMapping {
  sourceFolder: string
  action: 'new' | 'merge'
  newListName?: string
  targetList?: string
}

interface CommitBody {
  importId?: string
  folderMappings?: FolderMapping[]
  rootBookmarksList?: string
}

// POST /api/import/bookmarks/commit
router.post('/bookmarks/commit', async (req, res) => {
  if (req.plan !== 'pro') {
    return res.status(403).json({ error: 'pro_required' })
  }

  const { importId, folderMappings, rootBookmarksList } = (req.body ?? {}) as CommitBody

  if (!importId || typeof importId !== 'string') {
    return res.status(400).json({ error: 'importId_required' })
  }

  const cached = importCache.get(importId)
  if (!cached || cached.userId !== req.userId) {
    return res.status(404).json({ error: 'import_not_found' })
  }
  if (cached.expiresAt <= Date.now()) {
    importCache.delete(importId)
    return res.status(410).json({ error: 'import_expired' })
  }

  const flat = flatten(cached.tree)
  const sourceTopLevels = new Set<string>()
  for (const b of flat) {
    if (b.topLevelFolder) sourceTopLevels.add(b.topLevelFolder)
  }

  const folderToList = new Map<string, string>()
  for (const fm of folderMappings ?? []) {
    if (!fm || typeof fm.sourceFolder !== 'string') continue
    if (!sourceTopLevels.has(fm.sourceFolder)) continue
    if (fm.action === 'new') {
      const name = (fm.newListName ?? fm.sourceFolder).trim() || fm.sourceFolder
      folderToList.set(fm.sourceFolder, name)
    } else if (fm.action === 'merge') {
      if (!fm.targetList || typeof fm.targetList !== 'string') {
        return res
          .status(400)
          .json({ error: 'targetList_required', sourceFolder: fm.sourceFolder })
      }
      folderToList.set(fm.sourceFolder, fm.targetList)
    } else {
      return res.status(400).json({ error: 'invalid_mapping_action' })
    }
  }
  for (const folder of sourceTopLevels) {
    if (!folderToList.has(folder)) folderToList.set(folder, folder)
  }

  const rootListName =
    (typeof rootBookmarksList === 'string' && rootBookmarksList.trim()) || DEFAULT_ROOT_LIST

  interface PlanRow {
    listName: string
    category: string
    title: string
    url: string
    normalizedUrl: string
  }
  const plan: PlanRow[] = []
  for (const b of flat) {
    if (b.topLevelFolder == null) {
      plan.push({
        listName: rootListName,
        category: UNCATEGORIZED,
        title: b.title,
        url: b.url,
        normalizedUrl: b.normalizedUrl,
      })
      continue
    }
    const listName = folderToList.get(b.topLevelFolder)!
    plan.push({
      listName,
      category: categoryFromSubPath(b.subPath),
      title: b.title,
      url: b.url,
      normalizedUrl: b.normalizedUrl,
    })
  }

  const userId = req.userId!
  const destLists = [...new Set(plan.map((p) => p.listName))]

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existingListsRes = await client.query<{ list_name: string }>(
      `SELECT DISTINCT list_name FROM todos WHERE user_id = $1`,
      [userId]
    )
    const preExistingLists = new Set(existingListsRes.rows.map((r) => r.list_name))

    const existingBookmarks = await client.query<{ list_name: string; url: string }>(
      `SELECT list_name, url FROM todos
       WHERE user_id = $1
         AND type = 'bookmark'
         AND url IS NOT NULL
         AND list_name = ANY($2::text[])`,
      [userId, destLists]
    )
    const seen = new Set<string>()
    for (const row of existingBookmarks.rows) {
      seen.add(`${row.list_name}\t${normalizeUrl(row.url)}`)
    }

    let inserted = 0
    let skippedDuplicates = 0

    for (const p of plan) {
      const key = `${p.listName}\t${p.normalizedUrl}`
      if (seen.has(key)) {
        skippedDuplicates++
        continue
      }
      seen.add(key)
      await client.query(
        `INSERT INTO todos
           (user_id, list_name, title, description, category, priority, status,
            due_date, repeat_days, repeat_months, spawned_next, type, url)
         VALUES ($1, $2, $3, '', $4, 2, 0, NULL, 0, 0, 0, 'bookmark', $5)`,
        [userId, p.listName, p.title, p.category, p.url]
      )
      inserted++
    }

    await client.query('COMMIT')

    const listsCreated = destLists.filter((l) => !preExistingLists.has(l)).length
    importCache.delete(importId)

    res.json({ inserted, skippedDuplicates, listsCreated })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[import/commit] failed:', err)
    res.status(500).json({ error: 'commit_failed' })
  } finally {
    client.release()
  }
})

export default router
