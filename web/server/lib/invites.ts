import crypto from 'crypto'
import { query } from '../db.js'
import { LIMITS } from './limits.js'
import { publishToCollab } from './realtime.js'

/**
 * The parts of the invite flow that live outside the authenticated routes.
 *
 * Two callers need them and neither can reach `routes/collab.ts`: the signup
 * hook in `auth.ts` (which runs before the request has a session at all) and
 * the unauthenticated landing-page preview. Keeping them here also means the
 * free-guest cap is enforced in one place rather than being restated at every
 * door into a share.
 */

/** The raw token exists only in the email; the database stores this. */
export function hashInviteToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export interface InvitePreview {
  list_name: string
  inviter_name: string
  role: 'viewer' | 'editor'
  /** The address this was sent to, so the landing page can say which to use. */
  email: string
  expires_at: string
  /** Decides whether the page offers "sign in" or "create an account". */
  has_account: boolean
}

export type PreviewResult =
  | { ok: InvitePreview }
  | { error: 'not_found' | 'invite_expired' }

/**
 * What an invite link points at, resolvable without a session.
 *
 * Everything returned here is already in the recipient's inbox, so holding the
 * token reveals nothing new — but the token is the only credential, so an
 * unknown one must be indistinguishable from a revoked or accepted one.
 */
export async function previewInvite(rawToken: string): Promise<PreviewResult> {
  const { rows } = await query<{
    role: string
    email: string
    expires_at: Date
    list_name: string
    inviter_name: string | null
    inviter_email: string
    invitee_id: string | null
  }>(
    `SELECT i.role, i.email, i.expires_at, c.list_name,
            u.name AS inviter_name, u.email AS inviter_email,
            invitee.id AS invitee_id
       FROM list_collab_invite i
       JOIN list_collab c ON c.id = i.collab_id
       JOIN "user" u ON u.id = i.invited_by
       LEFT JOIN "user" invitee ON lower(invitee.email) = lower(i.email)
      WHERE i.status = 'pending' AND i.token_hash = $1`,
    [hashInviteToken(rawToken)]
  )

  const row = rows[0]
  if (!row) return { error: 'not_found' }
  if (row.expires_at.getTime() < Date.now()) return { error: 'invite_expired' }

  return {
    ok: {
      list_name: row.list_name,
      inviter_name: row.inviter_name || row.inviter_email,
      role: row.role as 'viewer' | 'editor',
      email: row.email,
      expires_at: row.expires_at.toISOString(),
      has_account: row.invitee_id != null,
    },
  }
}

/**
 * Attaches any invites waiting on a newly created account's email address.
 *
 * This is the whole point of inviting someone who isn't a user yet: they follow
 * the link, sign up, and the list is simply there. Without it the invite email
 * is a dead end.
 *
 * A brand-new account has no tier yet, so it counts as free and the free-guest
 * cap applies. Invites beyond the cap are deliberately left `pending` rather
 * than dropped — they still show in the invite banner, so upgrading makes them
 * available instead of silently losing them.
 *
 * Matching is by email only. Someone who signs up with a *different* address
 * still gets in by presenting the token on the landing page, because the token
 * is the stronger claim.
 */
export async function claimPendingInvites(userId: string, email: string): Promise<number> {
  const { rows } = await query<{ id: string; collab_id: string; role: string }>(
    `SELECT i.id, i.collab_id, i.role
       FROM list_collab_invite i
       JOIN list_collab c ON c.id = i.collab_id
      WHERE i.status = 'pending'
        AND i.expires_at > NOW()
        AND lower(i.email) = lower($1)
        AND c.owner_user_id <> $2
        AND NOT EXISTS (
              SELECT 1 FROM list_collab_member m
               WHERE m.collab_id = i.collab_id AND m.user_id = $2
            )
      ORDER BY i.created_at ASC`,
    [email, userId]
  )
  if (rows.length === 0) return 0

  const { rows: held } = await query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM list_collab_member WHERE user_id = $1`,
    [userId]
  )
  const budget = LIMITS.maxSharedLists - Number(held[0]?.count ?? 0)
  if (budget <= 0) return 0

  const claimed: number[] = []
  for (const invite of rows.slice(0, budget)) {
    const collabId = Number(invite.collab_id)
    await query(
      `INSERT INTO list_collab_member (collab_id, user_id, role, invited_by)
       SELECT $1, $2, $3, c.owner_user_id FROM list_collab c WHERE c.id = $1
       ON CONFLICT (collab_id, user_id) DO NOTHING`,
      [collabId, userId, invite.role]
    )
    await query(
      `UPDATE list_collab_invite
          SET status = 'accepted', accepted_by = $1, accepted_at = NOW()
        WHERE id = $2`,
      [userId, invite.id]
    )
    claimed.push(collabId)
  }

  // The owner is very likely sitting on the share page watching for this.
  for (const collabId of claimed) {
    void publishToCollab({ type: 'membership_changed', collab_id: collabId }, collabId)
  }

  return claimed.length
}
