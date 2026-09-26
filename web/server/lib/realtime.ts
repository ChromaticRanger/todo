import pg from 'pg'
import { randomUUID } from 'node:crypto'
import type { Response } from 'express'
import { query, connectionOptions } from '../db.js'

/**
 * Server-Sent Events fan-out for shared lists.
 *
 * Shape: one long-lived `GET /api/events` per browser tab, and a Postgres
 * LISTEN/NOTIFY bus so a write handled by one app instance reaches tabs
 * connected to another. We run more than one instance, so an in-process
 * registry alone would be silently wrong — the two users in a share are
 * routinely on different instances, and the symptom (events sometimes just
 * don't arrive) looks exactly like a product bug.
 *
 * Delivery is local-first: the publishing instance writes to its own sockets
 * immediately and tags the NOTIFY with its instance id, which every other
 * instance uses to skip the copy it would otherwise deliver twice. That also
 * means a broken listener degrades rather than breaks — same-instance tabs
 * keep updating, and the client's slow poll covers the rest.
 *
 * Payloads carry ids only, never item bodies: it keeps NOTIFY under its 8000
 * byte cap, and it means we never have to re-filter content per recipient.
 *
 * HARD CONSTRAINT: `pool.max` is 3. Nothing here may hold a pooled client for
 * the life of a connection — three SSE streams doing that would deadlock the
 * whole server. Queries go through `query()`, which releases immediately, and
 * the listener owns a standalone client that is never borrowed from the pool.
 */

const CHANNEL = 'stash_realtime'
const HEARTBEAT_MS = 25_000
const MAX_CONNS_PER_USER = 5
/** Postgres caps NOTIFY payloads at 8000 bytes; stay well clear. */
const NOTIFY_SAFE_BYTES = 7000
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

export type RealtimeEvent =
  | { type: 'list_changed'; collab_id: number; actor_id?: string }
  | { type: 'membership_changed'; collab_id: number }
  | { type: 'invite_received' }
  | { type: 'resync' }

interface Conn {
  id: string
  userId: string
  res: Response
}

/** Distinguishes our own NOTIFY echo from another instance's. */
const INSTANCE_ID = randomUUID()

const conns = new Map<string, Set<Conn>>()

// ── Delivery ────────────────────────────────────────────────────────────────

function write(conn: Conn, ev: RealtimeEvent): void {
  try {
    conn.res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`)
  } catch {
    // Socket already gone; the 'close' handler will unregister it.
  }
}

function deliver(userId: string, ev: RealtimeEvent): void {
  const set = conns.get(userId)
  if (!set) return
  for (const conn of set) write(conn, ev)
}

function broadcastLocal(ev: RealtimeEvent): void {
  for (const set of conns.values()) {
    for (const conn of set) write(conn, ev)
  }
}

// ── Publishing ──────────────────────────────────────────────────────────────

interface Envelope {
  v: 1
  origin: string
  ev: RealtimeEvent
  /** Explicit recipients, when they fit in a NOTIFY payload. */
  audience?: string[]
  /** Otherwise: the collab whose audience each instance resolves for itself. */
  resolve?: number
}

/**
 * Everyone who can see a share: the owner plus every current member.
 *
 * Resolved at publish time rather than cached against a connection, so someone
 * removed from a share stops receiving its events on their next event, not
 * whenever they happen to reconnect.
 */
export async function audienceFor(collabId: number): Promise<string[]> {
  const { rows } = await query<{ user_id: string }>(
    `SELECT owner_user_id AS user_id FROM list_collab WHERE id = $1
      UNION
     SELECT user_id FROM list_collab_member WHERE collab_id = $1`,
    [collabId]
  )
  return rows.map((r) => r.user_id)
}

/** Delivers to the named users here, and to the other instances via NOTIFY. */
export async function publish(ev: RealtimeEvent, audience: string[]): Promise<void> {
  if (audience.length === 0) return

  for (const userId of audience) deliver(userId, ev)

  const envelope: Envelope = { v: 1, origin: INSTANCE_ID, ev, audience }
  let payload = JSON.stringify(envelope)

  // A share with enough members to blow the NOTIFY cap is vanishingly rare, but
  // truncating the audience would silently drop recipients. Send the collab id
  // instead and let each instance look the audience up itself.
  if (Buffer.byteLength(payload) > NOTIFY_SAFE_BYTES) {
    const collabId = 'collab_id' in ev ? ev.collab_id : null
    if (collabId == null) return
    payload = JSON.stringify({ v: 1, origin: INSTANCE_ID, ev, resolve: collabId })
  }

  try {
    await query(`SELECT pg_notify($1, $2)`, [CHANNEL, payload])
  } catch (err) {
    // Cross-instance delivery failed; local subscribers already have it and the
    // client's poll fallback catches the rest.
    console.error('[realtime] pg_notify failed:', err)
  }
}

/** Convenience for the common case: an event addressed to a share's audience. */
export async function publishToCollab(ev: RealtimeEvent, collabId: number): Promise<void> {
  await publish(ev, await audienceFor(collabId))
}

// ── Subscription ────────────────────────────────────────────────────────────

/**
 * Turns a request into an SSE stream and registers it. Owns the whole
 * connection lifecycle; the route itself is just auth plus this call.
 */
export function subscribe(userId: string, res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    // `no-transform` matters as much as `no-cache`: any proxy that decides to
    // gzip this stream will buffer it, and the events simply never arrive.
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Nginx-family proxies buffer proxied responses by default.
    'X-Accel-Buffering': 'no',
  })
  res.flushHeaders?.()

  // Tell EventSource how long to wait before reconnecting after a drop.
  res.write('retry: 5000\n\n')
  // An open stream is idle by definition; without this Node closes it out from
  // under us after the default socket timeout.
  res.socket?.setTimeout(0)
  res.socket?.setNoDelay(true)
  res.socket?.setKeepAlive(true)

  const conn: Conn = { id: randomUUID(), userId, res }

  let set = conns.get(userId)
  if (!set) {
    set = new Set()
    conns.set(userId, set)
  }
  // A tab that reloads in a loop, or a user with many windows, must not be able
  // to pin an unbounded number of sockets open. Oldest goes first.
  while (set.size >= MAX_CONNS_PER_USER) {
    const oldest = set.values().next().value
    if (!oldest) break
    set.delete(oldest)
    try {
      oldest.res.end()
    } catch {}
  }
  set.add(conn)

  // The client may have missed events while it was away — reconnects are
  // routine (deploys, sleep, flaky networks). Rather than keep a replay log,
  // tell it to refetch what it's showing.
  write(conn, { type: 'resync' })

  const cleanup = () => {
    const current = conns.get(userId)
    if (!current) return
    current.delete(conn)
    if (current.size === 0) conns.delete(userId)
  }
  res.on('close', cleanup)
  res.on('error', cleanup)
}

/** Open connections on this instance — surfaced by the health endpoint. */
export function connectionStats(): { users: number; connections: number } {
  let connections = 0
  for (const set of conns.values()) connections += set.size
  return { users: conns.size, connections }
}

// ── Postgres listener ───────────────────────────────────────────────────────

let listener: pg.Client | null = null
let listenerHealthy = false
let reconnectMs = RECONNECT_MIN_MS
let heartbeat: NodeJS.Timeout | null = null
let stopped = false

function onNotification(msg: pg.Notification): void {
  if (msg.channel !== CHANNEL || !msg.payload) return
  let env: Envelope
  try {
    env = JSON.parse(msg.payload) as Envelope
  } catch {
    return
  }
  // Our own echo — these sockets were written to before the NOTIFY was sent.
  if (env.origin === INSTANCE_ID) return

  if (env.audience) {
    for (const userId of env.audience) deliver(userId, env.ev)
  } else if (env.resolve != null) {
    void audienceFor(env.resolve)
      .then((ids) => ids.forEach((id) => deliver(id, env.ev)))
      .catch(() => {})
  }
}

async function connectListener(): Promise<void> {
  if (stopped) return

  // DigitalOcean's managed-Postgres *connection pool* endpoint (port 25061)
  // runs PgBouncer in transaction mode, where LISTEN silently never delivers —
  // no error, just nothing. REALTIME_DATABASE_URL is the escape hatch if
  // DATABASE_URL is ever pointed at a pool.
  const url = process.env.REALTIME_DATABASE_URL || process.env.DATABASE_URL!
  const client = new pg.Client(connectionOptions(url))

  client.on('error', (err) => {
    console.error('[realtime] listener error:', err.message)
    listenerHealthy = false
    client.removeAllListeners()
    client.end().catch(() => {})
    if (listener === client) listener = null
    scheduleReconnect()
  })

  try {
    await client.connect()
    await client.query(`LISTEN ${CHANNEL}`)
    client.on('notification', onNotification)
    listener = client
    reconnectMs = RECONNECT_MIN_MS

    // We were disconnected and may have missed cross-instance events while we
    // were away. Nobody knows which, so tell every local tab to refetch.
    if (!listenerHealthy) broadcastLocal({ type: 'resync' })
    listenerHealthy = true
    console.log('[realtime] listening on', CHANNEL)
  } catch (err) {
    listenerHealthy = false
    console.error('[realtime] listener connect failed:', (err as Error).message)
    client.end().catch(() => {})
    scheduleReconnect()
  }
}

function scheduleReconnect(): void {
  if (stopped) return
  const delay = reconnectMs
  reconnectMs = Math.min(reconnectMs * 2, RECONNECT_MAX_MS)
  setTimeout(() => void connectListener(), delay).unref()
}

/**
 * Starts the listener and the heartbeat. Called explicitly at boot rather than
 * on import, so scripts that pull in a route module don't open a connection or
 * keep the process alive.
 */
export function startRealtime(): void {
  if (heartbeat) return
  stopped = false

  // DigitalOcean's edge drops connections that go quiet for around a minute, so
  // a comment frame goes down every stream well inside that window. It also
  // gives us a cheap liveness check: a write to a half-open socket errors and
  // triggers the close handler.
  heartbeat = setInterval(() => {
    for (const set of conns.values()) {
      for (const conn of set) {
        try {
          conn.res.write(': ping\n\n')
        } catch {}
      }
    }
  }, HEARTBEAT_MS)
  heartbeat.unref()

  void connectListener()
}

export function isRealtimeHealthy(): boolean {
  return listenerHealthy
}

export async function stopRealtime(): Promise<void> {
  stopped = true
  if (heartbeat) clearInterval(heartbeat)
  heartbeat = null
  for (const set of conns.values()) {
    for (const conn of set) {
      try {
        conn.res.end()
      } catch {}
    }
  }
  conns.clear()
  if (listener) {
    await listener.end().catch(() => {})
    listener = null
  }
  listenerHealthy = false
}
