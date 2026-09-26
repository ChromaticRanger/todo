import { EventEmitter } from 'node:events'
import type { Response } from 'express'
import { query } from '../db.js'

/**
 * Minimal test harness.
 *
 * Deliberately not a test framework: adding one would mean a new dependency,
 * and installs here are constrained (npm 10 only — npm 11 lockfiles are
 * rejected by the DigitalOcean buildpack). These suites are plain tsx scripts
 * that talk to the local database, which is all they need. `npm run test:collab`
 * runs them; they are excluded from the production build because tsconfig.json
 * only references the app and node projects.
 *
 * They are NOT hermetic — they need `npm run db:up` and a migrated local
 * database, and they create and delete real rows under a unique id prefix.
 */

let failures = 0
let checks = 0

export function check(name: string, ok: boolean, detail = ''): void {
  checks++
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

export function suiteResult(): { checks: number; failures: number } {
  return { checks, failures }
}

export function heading(name: string): void {
  console.log(`\n${name}`)
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

// ── SSE response stub ───────────────────────────────────────────────────────

export interface ResStub {
  res: Response
  chunks: string[]
  headers: Record<string, string>
  ended: boolean
  /** Parsed SSE frames, ignoring `: ping` comments. */
  events(): { type: string; data: Record<string, unknown> }[]
}

/**
 * Stands in for an Express response holding an open stream. Enough surface for
 * `subscribe()`: header capture, chunk capture, a socket with the three tuning
 * calls, and close/error events.
 */
export function stubRes(): ResStub {
  const emitter = new EventEmitter()
  const chunks: string[] = []
  const stub: ResStub = {
    chunks,
    headers: {},
    ended: false,
    events() {
      const out: { type: string; data: Record<string, unknown> }[] = []
      for (const frame of chunks.join('').split('\n\n')) {
        const m = /^event: (\S+)\ndata: (.*)$/s.exec(frame.trim())
        if (m) out.push({ type: m[1], data: JSON.parse(m[2]) as Record<string, unknown> })
      }
      return out
    },
    res: null as unknown as Response,
  }
  stub.res = Object.assign(emitter, {
    writeHead(_code: number, headers: Record<string, string>) {
      stub.headers = headers
      return this
    },
    flushHeaders() {},
    write(chunk: string) {
      if (stub.ended) return false
      chunks.push(chunk)
      return true
    },
    end() {
      stub.ended = true
      emitter.emit('close')
    },
    socket: { setTimeout() {}, setNoDelay() {}, setKeepAlive() {} },
  }) as unknown as Response
  return stub
}

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Every row a suite creates hangs off one of these ids, so cleanup is a single
 * delete on "user" and the cascades take the rest.
 */
export function fixtureTag(prefix: string): string {
  return `test-${prefix}-${Date.now().toString(36)}`
}

export async function createUser(
  id: string,
  tier: 'free' | 'pro' | null = 'pro',
  email = `${id}@example.test`
): Promise<void> {
  await query(
    `INSERT INTO "user" (id, name, email, "emailVerified", tier)
     VALUES ($1, $1, $2, true, $3)`,
    [id, email, tier]
  )
}

export async function createShare(ownerId: string, listName: string): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO list_collab (owner_user_id, list_name) VALUES ($1, $2) RETURNING id`,
    [ownerId, listName]
  )
  return Number(rows[0].id)
}

export async function addMember(
  collabId: number,
  userId: string,
  role: 'viewer' | 'editor',
  invitedBy: string
): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO list_collab_member (collab_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [collabId, userId, role, invitedBy]
  )
  return Number(rows[0].id)
}

/** Deletes the users and lets the cascades clear shares, members and invites. */
export async function dropUsers(ids: string[]): Promise<void> {
  await query(`DELETE FROM "user" WHERE id = ANY($1)`, [ids])
}
