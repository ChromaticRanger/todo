// Minimal front-matter parser for blog post uploads.
//
// A post file is a leading `---` fenced block of simple `key: value` lines,
// followed by the markdown body:
//
//   ---
//   title: Jump straight to a todo on the calendar
//   slug: calendar-jump
//   summary: Click the calendar icon on any event to land on it.
//   published: true
//   ---
//   Body markdown goes here…
//
// Only the keys below are recognised; unknown keys are ignored. We deliberately
// avoid a YAML dependency — the value grammar here is just trimmed strings and
// booleans, so a hand-rolled line parser is safer and has no supply-chain cost.

export interface ParsedPost {
  title: string
  slug: string
  summary: string
  published: boolean
  /** ISO date string for the publish date, or null to default to "now". */
  date: string | null
  body: string
}

export class FrontmatterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FrontmatterError'
  }
}

/** Turn arbitrary text into a URL-safe kebab slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-') // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .slice(0, 80)
}

function parseBool(value: string): boolean {
  return /^(true|yes|1)$/i.test(value.trim())
}

/**
 * Parse an uploaded post file into its front-matter fields plus body.
 * Throws FrontmatterError (→ 400) when the block is missing or `title` is absent.
 */
export function parseFrontmatter(raw: string): ParsedPost {
  // Tolerate a UTF-8 BOM and CRLF line endings from editors.
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n')

  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text)
  if (!match) {
    throw new FrontmatterError(
      'Missing front-matter. Start the file with a --- block containing at least "title:".'
    )
  }

  const [, block, body] = match
  const fields: Record<string, string> = {}
  for (const line of block.split('\n')) {
    if (!line.trim()) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    fields[key] = value
  }

  const title = fields.title?.trim()
  if (!title) {
    throw new FrontmatterError('Front-matter must include a "title:" line.')
  }

  const slug = fields.slug ? slugify(fields.slug) : slugify(title)
  if (!slug) {
    throw new FrontmatterError('Could not derive a slug — add a "slug:" line.')
  }

  // Optional explicit publish date (e.g. for backfilling older posts). When
  // absent, the post is stamped with the current time at publish. Surface a
  // malformed date rather than silently ignoring it.
  let date: string | null = null
  if (fields.date) {
    if (Number.isNaN(Date.parse(fields.date))) {
      throw new FrontmatterError(`Could not parse "date: ${fields.date}". Use e.g. 2026-05-01.`)
    }
    date = fields.date.trim()
  }

  return {
    title,
    slug,
    summary: fields.summary?.trim() ?? '',
    published: fields.published ? parseBool(fields.published) : false,
    date,
    body: body.trim(),
  }
}
