import express from 'express'
import type { AddressInfo } from 'node:net'
import eventsRouter from '../routes/events.js'
import { publicInviteRouter } from '../routes/collab.js'
import { startRealtime, stopRealtime, publish, isRealtimeHealthy } from '../lib/realtime.js'
import { check, heading, sleep } from './harness.js'

/**
 * The HTTP surface: do the SSE frames actually leave Express unbuffered, and is
 * the invite preview reachable with no session at all.
 *
 * Auth is stubbed. Mount ORDER in the real app — /api/events ahead of both
 * requirePlan and rateLimit, the preview ahead of authMiddleware — is a static
 * property of index.ts that no HTTP test can observe, so it's asserted by
 * reading index.ts rather than pretended at here.
 */
export default async function run(): Promise<void> {
  let asUser = 'test-http-user'
  const app = express()
  app.use('/api/collab/invites/preview', publicInviteRouter)
  app.use((req, _res, next) => { req.userId = asUser; next() })
  app.use('/api/events', eventsRouter)

  const server = app.listen(0)
  await new Promise((r) => server.once('listening', r))
  const port = (server.address() as AddressInfo).port
  const events = `http://127.0.0.1:${port}/api/events`

  startRealtime()
  for (let i = 0; i < 40 && !isRealtimeHealthy(); i++) await sleep(50)

  try {
    heading('GET /api/events over HTTP')
    const ac = new AbortController()
    const res = await fetch(events, { signal: ac.signal })
    check('the stream opens', res.status === 200, String(res.status))
    check(
      'Content-Type survives Express',
      (res.headers.get('content-type') ?? '').includes('text/event-stream')
    )
    check('no-transform survives', (res.headers.get('cache-control') ?? '').includes('no-transform'))
    check('X-Accel-Buffering survives', res.headers.get('x-accel-buffering') === 'no')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const seen: string[] = []
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          seen.push(decoder.decode(value, { stream: true }))
        }
      } catch { /* aborted */ }
    })()

    await sleep(300)
    check(
      'opening frames arrive without waiting for the response to end',
      seen.join('').includes('event: resync')
    )

    const mark = seen.join('').length
    await publish({ type: 'list_changed', collab_id: 99 }, [asUser])
    await sleep(300)
    check(
      'a later event is pushed down the already-open socket',
      seen.join('').slice(mark).includes('event: list_changed')
    )
    ac.abort()
    await sleep(100)

    heading('stream access control')
    asUser = 'demo-abc123'
    check(
      'demo visitors get no stream, since they cannot be in a share',
      (await fetch(events)).status === 204
    )

    asUser = 'test-limiter-user'
    let refused = 0
    for (let i = 0; i < 25; i++) {
      const c = new AbortController()
      const r = await fetch(events, { signal: c.signal })
      if (r.status === 429) refused++
      c.abort()
    }
    check(
      'a reconnect storm is capped by the dedicated connection limiter',
      refused > 0,
      `${refused} of 25 refused`
    )

    heading('GET /api/collab/invites/preview without a session')
    const preview = `http://127.0.0.1:${port}/api/collab/invites/preview`
    check(
      'a missing token is a 400, not a crash',
      (await fetch(preview)).status === 400
    )
    check(
      'an unknown token is a 404 that reveals nothing',
      (await fetch(`${preview}?token=nope`)).status === 404
    )
  } finally {
    await stopRealtime()
    server.close()
  }
}
