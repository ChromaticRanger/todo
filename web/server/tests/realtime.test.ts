import pg from 'pg'
import { query, connectionOptions } from '../db.js'
import {
  startRealtime, stopRealtime, subscribe, publish, audienceFor,
  connectionStats, isRealtimeHealthy,
} from '../lib/realtime.js'
import { touchCollabContent } from '../lib/listAccess.js'
import {
  check, heading, sleep, stubRes, fixtureTag, createUser, createShare,
  addMember, dropUsers,
} from './harness.js'

/**
 * The realtime fan-out. The checks that matter most here are the cross-instance
 * ones: production runs two app instances, so a registry that only delivers
 * in-process passes every naive test and drops half the events in the wild.
 */
export default async function run(): Promise<void> {
  const tag = fixtureTag('rt')
  const owner = `${tag}-owner`
  const editor = `${tag}-editor`
  const viewer = `${tag}-viewer`
  const outsider = `${tag}-outsider`
  const users = [owner, editor, viewer, outsider]
  const LIST = `List ${tag}`

  for (const id of users) await createUser(id)
  const collabId = await createShare(owner, LIST)
  await addMember(collabId, editor, 'editor', owner)
  await addMember(collabId, viewer, 'viewer', owner)

  try {
    startRealtime()
    for (let i = 0; i < 40 && !isRealtimeHealthy(); i++) await sleep(50)

    heading('realtime: listener + audience')
    check('listener connects to Postgres', isRealtimeHealthy())

    const aud = (await audienceFor(collabId)).sort()
    check(
      'audience is owner + members, excluding outsiders',
      JSON.stringify(aud) === JSON.stringify([owner, editor, viewer].sort()),
      aud.join(',')
    )

    heading('realtime: SSE connection contract')
    const oStub = stubRes()
    subscribe(owner, oStub.res)
    check('Content-Type is text/event-stream', oStub.headers['Content-Type'] === 'text/event-stream')
    check(
      'Cache-Control carries no-transform, so no proxy gzips the stream',
      (oStub.headers['Cache-Control'] ?? '').includes('no-transform'),
      oStub.headers['Cache-Control']
    )
    check('X-Accel-Buffering disables proxy buffering', oStub.headers['X-Accel-Buffering'] === 'no')
    check('reconnect delay is advertised', oStub.chunks.join('').includes('retry: 5000'))
    check('a resync is sent on connect', oStub.events().some((e) => e.type === 'resync'))

    const eStub = stubRes()
    const vStub = stubRes()
    const xStub = stubRes()
    subscribe(editor, eStub.res)
    subscribe(viewer, vStub.res)
    subscribe(outsider, xStub.res)

    heading('realtime: delivery')
    const before = { o: oStub.events().length, e: eStub.events().length, x: xStub.events().length }
    await publish({ type: 'list_changed', collab_id: collabId }, [owner, editor])
    await sleep(200)
    check(
      'an event reaches only its named audience',
      oStub.events().length === before.o + 1 &&
        eStub.events().length === before.e + 1 &&
        xStub.events().length === before.x
    )
    check(
      'the publishing instance does not redeliver its own NOTIFY echo',
      oStub.events().filter((e) => e.type === 'list_changed').length === 1,
      `${oStub.events().filter((e) => e.type === 'list_changed').length} frames`
    )

    heading('realtime: touchCollabContent is the single publish point')
    const t0 = await query<{ ts: string }>(
      `SELECT content_changed_at AS ts FROM list_collab WHERE id = $1`, [collabId]
    )
    await touchCollabContent(collabId, editor)
    await sleep(200)
    const t1 = await query<{ ts: string }>(
      `SELECT content_changed_at AS ts FROM list_collab WHERE id = $1`, [collabId]
    )
    check(
      'it still advances content_changed_at, which the poll fallback reads',
      t1.rows[0].ts !== t0.rows[0].ts
    )
    check(
      'it reaches every member of the share',
      vStub.events().some((e) => e.type === 'list_changed') &&
        oStub.events().filter((e) => e.type === 'list_changed').length === 2
    )
    const last = oStub.events().filter((e) => e.type === 'list_changed').pop()!
    check('the actor travels with the event', last.data.actor_id === editor, String(last.data.actor_id))

    heading('realtime: cross-instance fan-out')
    const vBefore = vStub.events().length
    await query(`SELECT pg_notify('stash_realtime', $1)`, [
      JSON.stringify({
        v: 1,
        origin: 'a-different-instance',
        ev: { type: 'list_changed', collab_id: collabId },
        audience: [viewer],
      }),
    ])
    await sleep(400)
    check(
      'an event published by another instance is delivered here',
      vStub.events().length === vBefore + 1,
      `${vStub.events().length - vBefore} new`
    )

    // Watching the wire directly: an audience too large for a NOTIFY payload
    // must degrade to resolve-on-receipt rather than silently losing recipients.
    const spy = new pg.Client(connectionOptions(process.env.DATABASE_URL!))
    await spy.connect()
    await spy.query('LISTEN stash_realtime')
    const seen: string[] = []
    spy.on('notification', (m) => { if (m.payload) seen.push(m.payload) })
    const huge = Array.from({ length: 400 }, (_, i) => `padding-user-${i}`.padEnd(40, 'x'))
    await publish({ type: 'list_changed', collab_id: collabId }, huge)
    await sleep(400)
    const env = seen
      .map((p) => JSON.parse(p) as Record<string, unknown>)
      .find((p) => (p.ev as { collab_id?: number })?.collab_id === collabId)
    check(
      'an oversized audience degrades to resolve-on-receipt, never truncation',
      !!env && env.audience === undefined && env.resolve === collabId,
      env ? `resolve=${String(env.resolve)}` : 'no notify observed'
    )
    check(
      'the NOTIFY payload stays under the 8000-byte cap',
      !!env && Buffer.byteLength(JSON.stringify(env)) < 8000,
      env ? `${Buffer.byteLength(JSON.stringify(env))} bytes` : '-'
    )
    await spy.end()

    heading('realtime: connection hygiene')
    const extras = Array.from({ length: 6 }, () => stubRes())
    for (const s of extras) subscribe(outsider, s.res)
    check(
      'connections are capped per user, so a reload loop cannot pin sockets',
      connectionStats().connections <= 5 + 3,
      `${connectionStats().connections} across ${connectionStats().users} users`
    )
    check('evicted connections are closed rather than leaked', extras[0].ended || xStub.ended)

    const usersBefore = connectionStats().users
    vStub.res.end()
    await sleep(50)
    check(
      'a closed stream unregisters itself',
      connectionStats().users === usersBefore - 1,
      `${usersBefore} -> ${connectionStats().users}`
    )
  } finally {
    await stopRealtime()
    await dropUsers(users)
  }
}
