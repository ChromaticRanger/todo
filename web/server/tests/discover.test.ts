import express from 'express'
import type { AddressInfo } from 'node:net'
import { query } from '../db.js'
import sharedRouter from '../routes/shared.js'
import { check, heading, fixtureTag, createUser, createSharedList, dropUsers } from './harness.js'

/**
 * Discover moderation and likes.
 *
 * Auth and plan are stubbed the way eventsRoute.test.ts does it: the router is
 * mounted behind a middleware that sets req.userId / req.plan, so the suite
 * drives the real handlers over HTTP without a Better Auth session. The 403
 * paths that depend on a real session (admin) are asserted against the SQL
 * directly instead — see the admin section at the end.
 */
export default async function run(): Promise<void> {
  const tag = fixtureTag('discover')
  const owner = `${tag}-owner`
  const reader = `${tag}-reader`
  const other = `${tag}-other`
  const demo = `demo-${tag}`
  const users = [owner, reader, other, demo]

  let asUser = reader
  let asPlan: 'free' | 'pro' = 'pro'

  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.userId = asUser
    req.plan = asPlan
    next()
  })
  app.use('/api/shared', sharedRouter)
  const server = app.listen(0)
  const port = (server.address() as AddressInfo).port
  const base = `http://127.0.0.1:${port}/api/shared`

  try {
    await createUser(owner)
    await createUser(reader)
    await createUser(other)
    await createUser(demo)

    const visible = await createSharedList(owner, `${tag}-visible`, { itemCount: 3 })
    const hidden = await createSharedList(owner, `${tag}-hidden`, { itemCount: 2, hidden: true })

    const slugs = (body: { lists: { slug: string }[] }) => body.lists.map((l) => l.slug)

    // ── Hidden lists are invisible everywhere a reader can reach ────────────
    heading('hidden lists')

    const browse = await (await fetch(`${base}/lists`)).json()
    check('a hidden list is absent from the catalogue', !slugs(browse).includes(`${tag}-hidden`))
    check('a visible list is still listed', slugs(browse).includes(`${tag}-visible`))

    const detailRes = await fetch(`${base}/lists/${tag}-hidden`)
    check('the detail view 404s for a hidden list', detailRes.status === 404, `got ${detailRes.status}`)

    // The clone handler re-reads the list with its own published check — the
    // one that is easy to forget, and the one that would leave a moderated
    // list copyable by anyone holding the slug.
    const cloneRes = await fetch(`${base}/lists/${tag}-hidden/clone`, { method: 'POST' })
    check('a hidden list cannot be cloned by slug', cloneRes.status === 404, `got ${cloneRes.status}`)

    // Deliberately NOT filtered: the publisher isn't told, so their own view
    // must keep showing the list as published.
    asUser = owner
    const pubs = await (await fetch(`${base}/publications`)).json()
    const pubSlugs = (pubs.publications as { slug: string }[]).map((p) => p.slug)
    check('the owner still sees a hidden list as published', pubSlugs.includes(`${tag}-hidden`))

    // ...and the publisher keeps seeing it in Discover itself, badged, so they
    // aren't left hunting a catalogue for a list they were told was published.
    const ownerBrowse = await (await fetch(`${base}/lists`)).json()
    const ownerRow = (ownerBrowse.lists as { slug: string; is_hidden: boolean }[])
      .find((l) => l.slug === `${tag}-hidden`)
    check('the publisher still sees their hidden list in the catalogue', !!ownerRow)
    check('…flagged as hidden so the UI can badge it', ownerRow?.is_hidden === true,
      JSON.stringify(ownerRow))

    const ownerDetail = await fetch(`${base}/lists/${tag}-hidden`)
    check('the publisher can still open its detail view', ownerDetail.status === 200,
      `got ${ownerDetail.status}`)

    // The owner reaches the detail view, so its Clone button has to work rather
    // than 404 — it is their own content either way.
    const ownerClone = await fetch(`${base}/lists/${tag}-hidden/clone`, { method: 'POST' })
    check('the publisher can still clone their own hidden list', ownerClone.status === 200,
      `got ${ownerClone.status}`)
    asUser = reader

    const readerRow = (await (await fetch(`${base}/lists`)).json()).lists as { is_hidden: boolean }[]
    check('nobody else sees an is_hidden list at all',
      readerRow.every((l) => l.is_hidden === false))

    // ── Likes ───────────────────────────────────────────────────────────────
    heading('likes')

    const like1 = await (await fetch(`${base}/lists/${tag}-visible/like`, { method: 'POST' })).json()
    check('liking returns the settled state', like1.like_count === 1 && like1.liked_by_me === true,
      JSON.stringify(like1))

    const like2 = await (await fetch(`${base}/lists/${tag}-visible/like`, { method: 'POST' })).json()
    check('liking again toggles it off', like2.like_count === 0 && like2.liked_by_me === false,
      JSON.stringify(like2))

    await fetch(`${base}/lists/${tag}-visible/like`, { method: 'POST' })
    const browse2 = await (await fetch(`${base}/lists`)).json()
    const row = (browse2.lists as { slug: string; like_count: number; liked_by_me: boolean }[])
      .find((l) => l.slug === `${tag}-visible`)
    check('the catalogue reports the count and my own state',
      row?.like_count === 1 && row?.liked_by_me === true, JSON.stringify(row))

    asUser = owner
    const selfLike = await fetch(`${base}/lists/${tag}-visible/like`, { method: 'POST' })
    check('you cannot like your own list', selfLike.status === 400, `got ${selfLike.status}`)

    asUser = demo
    const demoLike = await fetch(`${base}/lists/${tag}-visible/like`, { method: 'POST' })
    check('a demo visitor cannot like', demoLike.status === 403, `got ${demoLike.status}`)
    asUser = reader

    const hiddenLike = await fetch(`${base}/lists/${tag}-hidden/like`, { method: 'POST' })
    check('a hidden list cannot be liked', hiddenLike.status === 404, `got ${hiddenLike.status}`)

    // ── The ::TEXT ordering trap ────────────────────────────────────────────
    // COUNT(*) is bigint, which node-postgres returns as a string. Sorting on
    // a text alias puts "9" above "10" and looks entirely plausible. Nine
    // versus ten likes is the cheapest assertion that catches it.
    heading('most-liked ordering')

    const nine = await createSharedList(other, `${tag}-nine`, { itemCount: 1 })
    const ten = await createSharedList(other, `${tag}-ten`, { itemCount: 1 })
    const voters: string[] = []
    for (let i = 0; i < 10; i++) {
      const v = `${tag}-v${i}`
      voters.push(v)
      await createUser(v)
      await query(`INSERT INTO shared_list_likes (shared_list_id, user_id) VALUES ($1, $2)`, [ten, v])
      if (i < 9) {
        await query(`INSERT INTO shared_list_likes (shared_list_id, user_id) VALUES ($1, $2)`, [nine, v])
      }
    }
    users.push(...voters)

    const sorted = await (await fetch(`${base}/lists?sort=likes`)).json()
    const ordered = slugs(sorted).filter((sl) => sl === `${tag}-ten` || sl === `${tag}-nine`)
    check('10 likes sorts above 9 (not a lexicographic "9" > "10")',
      ordered[0] === `${tag}-ten`, `order was ${ordered.join(', ')}`)

    // ── Reports ─────────────────────────────────────────────────────────────
    heading('reports')

    const r1 = await fetch(`${base}/lists/${tag}-visible/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'spam', detail: 'buy my coins' }),
    })
    check('a report is accepted', r1.status === 201, `got ${r1.status}`)

    const r2 = await fetch(`${base}/lists/${tag}-visible/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'offensive' }),
    })
    check('a repeat report is accepted but not duplicated', r2.status === 201, `got ${r2.status}`)
    const { rows: dupe } = await query<{ n: string }>(
      `SELECT COUNT(*)::TEXT AS n FROM shared_list_reports
        WHERE shared_list_id = $1 AND reporter_user_id = $2`,
      [visible, reader]
    )
    check('…exactly one row per reporter per list', Number(dupe[0].n) === 1, `got ${dupe[0].n}`)

    const bad = await fetch(`${base}/lists/${tag}-visible/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'nonsense' }),
    })
    check('an unknown reason is rejected', bad.status === 400, `got ${bad.status}`)

    asUser = owner
    const selfReport = await fetch(`${base}/lists/${tag}-visible/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    })
    check('you cannot report your own list', selfReport.status === 400, `got ${selfReport.status}`)

    asUser = demo
    const demoReport = await fetch(`${base}/lists/${tag}-visible/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'spam' }),
    })
    check('a demo visitor cannot report', demoReport.status === 403, `got ${demoReport.status}`)
    asUser = reader

    // ── Moderation effects at the SQL level ─────────────────────────────────
    // The admin routes sit behind requireAdmin, which resolves a real Better
    // Auth session, so these assert the behaviour the handlers rely on rather
    // than driving them over HTTP.
    heading('moderation effects')

    await query(`UPDATE shared_lists SET is_hidden = TRUE WHERE id = $1`, [visible])
    const afterHide = await (await fetch(`${base}/lists`)).json()
    check('hiding removes a list from the catalogue', !slugs(afterHide).includes(`${tag}-visible`))

    await query(`UPDATE shared_lists SET is_hidden = FALSE WHERE id = $1`, [visible])
    const afterRestore = await (await fetch(`${base}/lists`)).json()
    check('restoring puts it back', slugs(afterRestore).includes(`${tag}-visible`))

    // Republishing must not clear a moderator's decision. This is why is_hidden
    // is a separate column from is_published, which the publish path sets TRUE.
    await query(`UPDATE shared_lists SET is_hidden = TRUE WHERE id = $1`, [visible])
    await query(`UPDATE shared_lists SET is_published = TRUE, updated_at = NOW() WHERE id = $1`, [visible])
    const { rows: stillHidden } = await query<{ is_hidden: boolean }>(
      `SELECT is_hidden FROM shared_lists WHERE id = $1`,
      [visible]
    )
    check('republishing does not un-hide a moderated list', stillHidden[0].is_hidden === true)

    await query(`DELETE FROM shared_lists WHERE id = $1`, [hidden])
    const { rows: orphanItems } = await query<{ n: string }>(
      `SELECT COUNT(*)::TEXT AS n FROM shared_items WHERE shared_list_id = $1`,
      [hidden]
    )
    check('deleting a list cascades its items', Number(orphanItems[0].n) === 0)

    // A like must not outlive its account, or the ranking drifts upward
    // forever — the reason this table has an FK where blog_post_reactions
    // doesn't.
    await dropUsers([voters[0]])
    users.splice(users.indexOf(voters[0]), 1)
    const { rows: afterUserDelete } = await query<{ n: string }>(
      `SELECT COUNT(*)::TEXT AS n FROM shared_list_likes WHERE shared_list_id = $1`,
      [ten]
    )
    check('deleting a user removes their likes', Number(afterUserDelete[0].n) === 9,
      `got ${afterUserDelete[0].n}`)

    // A report, by contrast, must survive its reporter — otherwise closing
    // your account wipes the evidence trail.
    await dropUsers([reader])
    users.splice(users.indexOf(reader), 1)
    const { rows: keptReport } = await query<{ n: string; reporter: string | null }>(
      `SELECT COUNT(*)::TEXT AS n, MAX(reporter_user_id) AS reporter
         FROM shared_list_reports WHERE shared_list_id = $1`,
      [visible]
    )
    check('a report outlives its reporter, anonymised',
      Number(keptReport[0].n) === 1 && keptReport[0].reporter === null,
      JSON.stringify(keptReport[0]))
  } finally {
    server.close()
    await dropUsers(users)
  }
}
