import { Router } from 'express'
import crypto from 'crypto'
import { query } from '../db.js'
import { LIMITS } from '../lib/limits.js'
import { invalidateCollabMemo } from '../lib/listAccess.js'
import { publish, publishToCollab, audienceFor } from '../lib/realtime.js'
import { sendListInviteEmailFor } from '../lib/email.js'

const router = Router()

const INVITE_TTL_DAYS = 14
const ROLES = ['viewer', 'editor'] as const
type Role = (typeof ROLES)[number]

// Events live outside any list, so the sentinel they're pinned to must never
// become shareable — it isn't a real list and has no meaningful membership.
const EVENTS_LIST = '__events__'

/**
 * Accounts that must never appear on either side of a share: the shared demo
 * template, the ephemeral per-visitor demo users, and the system account that
 * owns the curated Discover lists.
 */
function isReservedUser(id: string): boolean {
  return id === 'demo-user' || id.startsWith('demo-') || id === 'system-stash-squirrel'
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** The raw token goes in the email; only its hash is stored. */
function newToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw) }
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function expiryDate(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
}

/** Does this user actually have a list by this name (items or a known empty one)? */
async function ownsList(userId: string, listName: string): Promise<boolean> {
  const { rowCount } = await query(
    `SELECT 1 FROM todos
      WHERE user_id = $1 AND list_name = $2 AND type <> 'event' LIMIT 1`,
    [userId, listName]
  )
  if ((rowCount ?? 0) > 0) return true
  const { rows } = await query<{ value: string[] }>(
    `SELECT value FROM app_settings WHERE user_id = $1 AND key = 'empty_lists'`,
    [userId]
  )
  return (rows[0]?.value ?? []).includes(listName)
}

/** The share row for one of the caller's own lists, creating it on first use. */
async function ensureCollab(ownerId: string, listName: string): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO list_collab (owner_user_id, list_name) VALUES ($1, $2)
     ON CONFLICT (owner_user_id, list_name)
       DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [ownerId, listName]
  )
  invalidateCollabMemo(ownerId, listName)
  return Number(rows[0].id)
}

function parseId(value: string): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

// ── Change polling ──────────────────────────────────────────────────────────

// GET /api/collab/changes?since=<epoch seconds>
//
// The cheap "has anything moved?" endpoint the client polls. Deliberately
// returns nothing but ids and counts — the client already knows how to fetch
// list contents, and keeping payloads to ids means this same shape can be
// pushed down an SSE stream later without rethinking permissions.
//
// Three signals, because there are three distinct things that can go stale:
//   * `changed`   — shares whose ITEMS moved since `since`
//   * `visible`   — every share the caller can currently see, so the client can
//                   spot one appearing or disappearing (accepted, revoked, left)
//   * `pending_invites` — so an invitation shows up without a reload
router.get('/changes', async (req, res) => {
  const userId = req.userId!
  // Milliseconds throughout. Seconds would be truncated on the way out and
  // rounded on the way back from Postgres, so a change landing in the same
  // second as the previous poll could be reported forever (or missed).
  const sinceRaw = Number(req.query.since)
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : null

  try {
    const [collabs, invites] = await Promise.all([
      query<{ id: string; changed_at: string }>(
        `SELECT c.id,
                (EXTRACT(EPOCH FROM c.content_changed_at) * 1000)::BIGINT AS changed_at
           FROM list_collab c
          WHERE c.owner_user_id = $1
             OR EXISTS (
                  SELECT 1 FROM list_collab_member m
                   WHERE m.collab_id = c.id AND m.user_id = $1
                )`,
        [userId]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::TEXT AS count
           FROM list_collab_invite i
           JOIN list_collab c ON c.id = i.collab_id
          WHERE i.status = 'pending' AND i.expires_at > NOW()
            AND c.owner_user_id <> $1
            AND lower(i.email) = (SELECT lower(email) FROM "user" WHERE id = $1)`,
        [userId]
      ),
    ])

    res.json({
      now: Date.now(),
      changed: since === null
        ? []
        : collabs.rows.filter((r) => Number(r.changed_at) > since).map((r) => Number(r.id)),
      visible: collabs.rows.map((r) => Number(r.id)),
      pending_invites: Number(invites.rows[0]?.count ?? 0),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Owner: share status for one list ────────────────────────────────────────

// GET /api/collab/lists/:name — members and pending invites for a list I own.
router.get('/lists/:name', async (req, res) => {
  const userId = req.userId!
  try {
    const { rows: collabRows } = await query<{ id: string }>(
      `SELECT id FROM list_collab WHERE owner_user_id = $1 AND list_name = $2`,
      [userId, req.params.name]
    )
    if (!collabRows[0]) {
      res.json({ collab_id: null, members: [], invites: [] })
      return
    }
    const collabId = Number(collabRows[0].id)

    const [members, invites] = await Promise.all([
      query<{ id: string; user_id: string; role: string; name: string | null; email: string }>(
        `SELECT m.id, m.user_id, m.role, u.name, u.email
           FROM list_collab_member m JOIN "user" u ON u.id = m.user_id
          WHERE m.collab_id = $1 ORDER BY u.email`,
        [collabId]
      ),
      query<{ id: string; email: string; role: string; expires_at: Date }>(
        `SELECT id, email, role, expires_at FROM list_collab_invite
          WHERE collab_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
        [collabId]
      ),
    ])

    res.json({
      collab_id: collabId,
      members: members.rows.map((m) => ({
        id: Number(m.id),
        user_id: m.user_id,
        role: m.role,
        name: m.name,
        email: m.email,
      })),
      invites: invites.rows.map((i) => ({
        id: Number(i.id),
        email: i.email,
        role: i.role,
        expires_at: i.expires_at,
        expired: i.expires_at.getTime() < Date.now(),
      })),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Owner: invite someone ───────────────────────────────────────────────────

// POST /api/collab/lists/:name/invites — Pro only.
//
// Creating a share is the monetised action; accepting one is free (see
// LIMITS.maxSharedLists). A Pro owner who downgrades keeps their existing
// shares working and simply can't send new invites — this check is the whole
// of that policy.
router.post('/lists/:name/invites', async (req, res) => {
  const userId = req.userId!
  const listName = req.params.name
  const { email, role } = req.body as { email?: string; role?: string }

  if (req.plan !== 'pro') {
    res.status(403).json({ error: 'pro_required' })
    return
  }
  if (isReservedUser(userId)) {
    res.status(403).json({ error: 'sharing_unavailable' })
    return
  }
  const target = (email ?? '').trim().toLowerCase()
  if (!isValidEmail(target)) {
    res.status(400).json({ error: 'invalid_email' })
    return
  }
  const inviteRole: Role = role === 'editor' ? 'editor' : 'viewer'
  if (listName === EVENTS_LIST) {
    res.status(400).json({ error: 'not_shareable' })
    return
  }

  try {
    const { rows: meRows } = await query<{ email: string; name: string | null }>(
      `SELECT email, name FROM "user" WHERE id = $1`,
      [userId]
    )
    const me = meRows[0]
    if (!me) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    if (me.email.toLowerCase() === target) {
      res.status(400).json({ error: 'cannot_invite_self' })
      return
    }
    if (!(await ownsList(userId, listName))) {
      res.status(404).json({ error: 'unknown_list' })
      return
    }

    // Does the invitee already have an account? Decides the email's wording and
    // lets us reject a duplicate membership up front.
    const { rows: targetRows } = await query<{ id: string }>(
      `SELECT id FROM "user" WHERE lower(email) = $1`,
      [target]
    )
    const targetUser = targetRows[0]
    if (targetUser && isReservedUser(targetUser.id)) {
      res.status(400).json({ error: 'not_invitable' })
      return
    }

    const collabId = await ensureCollab(userId, listName)

    if (targetUser) {
      const { rowCount } = await query(
        `SELECT 1 FROM list_collab_member WHERE collab_id = $1 AND user_id = $2`,
        [collabId, targetUser.id]
      )
      if ((rowCount ?? 0) > 0) {
        res.status(409).json({ error: 'already_member' })
        return
      }
    }

    // A live invite for this address is refreshed rather than duplicated — the
    // partial unique index allows only one, and re-inviting should rotate the
    // token so any previously emailed link stops working.
    const { raw, hash } = newToken()
    await query(
      `INSERT INTO list_collab_invite
         (collab_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (collab_id, lower(email)) WHERE status = 'pending'
         DO UPDATE SET role = EXCLUDED.role,
                       token_hash = EXCLUDED.token_hash,
                       expires_at = EXCLUDED.expires_at,
                       invited_by = EXCLUDED.invited_by,
                       created_at = NOW()`,
      [collabId, target, inviteRole, hash, userId, expiryDate()]
    )

    const sent = await sendListInviteEmailFor(target, {
      listName,
      inviterName: me.name || me.email,
      role: inviteRole,
      token: raw,
      isNewUser: !targetUser,
    })

    // Someone who already has an account gets the banner immediately, without
    // waiting on the email or a reload.
    if (targetUser) {
      void publish({ type: 'invite_received' }, [targetUser.id])
    }

    res.status(201).json({ ok: true, emailed: sent, collab_id: collabId })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/collab/invites/:id/resend — rotate the token and email it again.
router.post('/invites/:id/resend', async (req, res) => {
  const userId = req.userId!
  const inviteId = parseId(req.params.id)
  if (inviteId === null) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (req.plan !== 'pro') {
    res.status(403).json({ error: 'pro_required' })
    return
  }
  try {
    const { rows } = await query<{
      id: string
      email: string
      role: string
      list_name: string
    }>(
      `SELECT i.id, i.email, i.role, c.list_name
         FROM list_collab_invite i JOIN list_collab c ON c.id = i.collab_id
        WHERE i.id = $1 AND c.owner_user_id = $2 AND i.status = 'pending'`,
      [inviteId, userId]
    )
    const invite = rows[0]
    if (!invite) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const { raw, hash } = newToken()
    await query(
      `UPDATE list_collab_invite
          SET token_hash = $1, expires_at = $2, created_at = NOW()
        WHERE id = $3`,
      [hash, expiryDate(), inviteId]
    )

    const { rows: meRows } = await query<{ email: string; name: string | null }>(
      `SELECT email, name FROM "user" WHERE id = $1`,
      [userId]
    )
    const { rows: targetRows } = await query<{ id: string }>(
      `SELECT id FROM "user" WHERE lower(email) = lower($1)`,
      [invite.email]
    )

    const sent = await sendListInviteEmailFor(invite.email, {
      listName: invite.list_name,
      inviterName: meRows[0]?.name || meRows[0]?.email || 'A Stash Squirrel user',
      role: invite.role as Role,
      token: raw,
      isNewUser: !targetRows[0],
    })
    res.json({ ok: true, emailed: sent })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/collab/invites/:id — revoke. The emailed link dies with it.
router.delete('/invites/:id', async (req, res) => {
  const userId = req.userId!
  const inviteId = parseId(req.params.id)
  if (inviteId === null) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  try {
    const { rowCount } = await query(
      `UPDATE list_collab_invite i
          SET status = 'revoked'
         FROM list_collab c
        WHERE i.collab_id = c.id AND i.id = $1
          AND c.owner_user_id = $2 AND i.status = 'pending'`,
      [inviteId, userId]
    )
    if (!rowCount) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Recipient: pending invites, accept, decline ─────────────────────────────

// GET /api/collab/invites/pending — invites waiting for my email address.
router.get('/invites/pending', async (req, res) => {
  const userId = req.userId!
  try {
    const { rows } = await query<{
      id: string
      role: string
      list_name: string
      inviter_name: string | null
      inviter_email: string
      expires_at: Date
    }>(
      `SELECT i.id, i.role, c.list_name,
              u.name AS inviter_name, u.email AS inviter_email, i.expires_at
         FROM list_collab_invite i
         JOIN list_collab c ON c.id = i.collab_id
         JOIN "user" u ON u.id = i.invited_by
        WHERE i.status = 'pending'
          AND i.expires_at > NOW()
          AND lower(i.email) = (SELECT lower(email) FROM "user" WHERE id = $1)
          AND c.owner_user_id <> $1
        ORDER BY i.created_at DESC`,
      [userId]
    )
    res.json({
      invites: rows.map((r) => ({
        id: Number(r.id),
        role: r.role,
        list_name: r.list_name,
        inviter: r.inviter_name || r.inviter_email,
        expires_at: r.expires_at,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

interface InviteRow {
  id: number
  collab_id: number
  role: Role
  owner_user_id: string
  list_name: string
  expires_at: Date
  email: string
}

/**
 * Turns a pending invite into a membership.
 *
 * The free-tier cap lives here rather than at share time: sharing is the Pro
 * action, but a free account joining an unbounded number of other people's
 * lists would sidestep its own list cap entirely.
 */
async function acceptInvite(
  userId: string,
  plan: 'free' | 'pro' | undefined,
  invite: InviteRow,
  res: import('express').Response
): Promise<void> {
  if (invite.owner_user_id === userId) {
    res.status(400).json({ error: 'cannot_join_own_list' })
    return
  }
  if (invite.expires_at.getTime() < Date.now()) {
    res.status(410).json({ error: 'invite_expired' })
    return
  }

  if (plan === 'free') {
    const { rows } = await query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM list_collab_member WHERE user_id = $1`,
      [userId]
    )
    if (Number(rows[0]?.count ?? 0) >= LIMITS.maxSharedLists) {
      res.status(403).json({
        error: 'free_tier_share_limit',
        limit: LIMITS.maxSharedLists,
      })
      return
    }
  }

  await query(
    `INSERT INTO list_collab_member (collab_id, user_id, role, invited_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (collab_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [invite.collab_id, userId, invite.role, invite.owner_user_id]
  )
  await query(
    `UPDATE list_collab_invite
        SET status = 'accepted', accepted_by = $1, accepted_at = NOW()
      WHERE id = $2`,
    [userId, invite.id]
  )

  // The tab strip changes for everyone on the list, not just the joiner.
  void publishToCollab({ type: 'membership_changed', collab_id: invite.collab_id }, invite.collab_id)

  res.json({
    ok: true,
    collab_id: invite.collab_id,
    key: `@${invite.collab_id}`,
    list_name: invite.list_name,
    role: invite.role,
  })
}

const INVITE_SELECT = `
  SELECT i.id, i.collab_id, i.role, i.expires_at, i.email,
         c.owner_user_id, c.list_name
    FROM list_collab_invite i
    JOIN list_collab c ON c.id = i.collab_id
   WHERE i.status = 'pending'`

function toInviteRow(r: {
  id: string
  collab_id: string
  role: string
  expires_at: Date
  email: string
  owner_user_id: string
  list_name: string
}): InviteRow {
  return {
    id: Number(r.id),
    collab_id: Number(r.collab_id),
    role: r.role as Role,
    expires_at: r.expires_at,
    email: r.email,
    owner_user_id: r.owner_user_id,
    list_name: r.list_name,
  }
}

// POST /api/collab/invites/:id/accept — accepting from the in-app banner,
// matched on the signed-in account's email address.
router.post('/invites/:id/accept', async (req, res) => {
  const userId = req.userId!
  const inviteId = parseId(req.params.id)
  if (inviteId === null) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  try {
    const { rows } = await query(
      `${INVITE_SELECT} AND i.id = $1
         AND lower(i.email) = (SELECT lower(email) FROM "user" WHERE id = $2)`,
      [inviteId, userId]
    )
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await acceptInvite(userId, req.plan, toInviteRow(rows[0] as never), res)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/collab/invites/accept — accepting from the emailed link.
//
// The token is proof enough on its own, so this deliberately does NOT require
// the signed-in address to match the invited one: people forward invites to the
// account they actually use, and failing that would be baffling.
router.post('/invites/accept', async (req, res) => {
  const userId = req.userId!
  const { token } = req.body as { token?: string }
  if (!token) {
    res.status(400).json({ error: 'token_required' })
    return
  }
  try {
    const { rows } = await query(`${INVITE_SELECT} AND i.token_hash = $1`, [
      hashToken(token),
    ])
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    await acceptInvite(userId, req.plan, toInviteRow(rows[0] as never), res)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// POST /api/collab/invites/:id/decline
router.post('/invites/:id/decline', async (req, res) => {
  const userId = req.userId!
  const inviteId = parseId(req.params.id)
  if (inviteId === null) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  try {
    const { rowCount } = await query(
      `UPDATE list_collab_invite
          SET status = 'declined'
        WHERE id = $1 AND status = 'pending'
          AND lower(email) = (SELECT lower(email) FROM "user" WHERE id = $2)`,
      [inviteId, userId]
    )
    if (!rowCount) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// ── Membership management ───────────────────────────────────────────────────

// PATCH /api/collab/members/:id — owner changes someone's role.
router.patch('/members/:id', async (req, res) => {
  const userId = req.userId!
  const memberId = parseId(req.params.id)
  const { role } = req.body as { role?: string }
  if (memberId === null) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  if (!ROLES.includes(role as Role)) {
    res.status(400).json({ error: 'invalid_role' })
    return
  }
  try {
    const { rows } = await query<{ collab_id: string }>(
      `UPDATE list_collab_member m
          SET role = $1
         FROM list_collab c
        WHERE m.collab_id = c.id AND m.id = $2 AND c.owner_user_id = $3
      RETURNING m.collab_id`,
      [role, memberId, userId]
    )
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    // Demotion to viewer has to reach the demoted tab promptly — until it
    // refetches, it's still showing edit and delete controls the server will
    // now refuse.
    const collabId = Number(rows[0].collab_id)
    void publishToCollab({ type: 'membership_changed', collab_id: collabId }, collabId)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/collab/members/:id — the owner removing someone, or a member
// leaving a list they were invited to.
router.delete('/members/:id', async (req, res) => {
  const userId = req.userId!
  const memberId = parseId(req.params.id)
  if (memberId === null) {
    res.status(404).json({ error: 'Not found' })
    return
  }
  try {
    const { rows } = await query<{ collab_id: string; user_id: string }>(
      `DELETE FROM list_collab_member m
        USING list_collab c
        WHERE m.collab_id = c.id AND m.id = $1
          AND (c.owner_user_id = $2 OR m.user_id = $2)
      RETURNING m.collab_id, m.user_id`,
      [memberId, userId]
    )
    if (!rows[0]) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    // The person who just lost access needs this event too, and they're no
    // longer in the share's audience — so add them explicitly.
    const collabId = Number(rows[0].collab_id)
    const removed = rows[0].user_id
    void audienceFor(collabId).then((ids) =>
      publish({ type: 'membership_changed', collab_id: collabId }, [...new Set([...ids, removed])])
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// DELETE /api/collab/lists/:name — stop sharing a list entirely. The list and
// its items stay; only the collaboration is torn down (members and pending
// invites cascade).
router.delete('/lists/:name', async (req, res) => {
  const userId = req.userId!
  try {
    // Capture the audience BEFORE the delete cascades the member rows away —
    // afterwards there is nobody left to address the event to.
    const existing = await query<{ id: string }>(
      `SELECT id FROM list_collab WHERE owner_user_id = $1 AND list_name = $2`,
      [userId, req.params.name]
    )
    const collabId = existing.rows[0] ? Number(existing.rows[0].id) : null
    const audience = collabId != null ? await audienceFor(collabId) : []

    const { rowCount } = await query(
      `DELETE FROM list_collab WHERE owner_user_id = $1 AND list_name = $2`,
      [userId, req.params.name]
    )
    invalidateCollabMemo(userId, req.params.name)
    if (collabId != null && rowCount) {
      void publish({ type: 'membership_changed', collab_id: collabId }, audience)
    }
    res.json({ ok: true, unshared: (rowCount ?? 0) > 0 })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

export default router
