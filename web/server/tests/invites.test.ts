import crypto from 'crypto'
import { query } from '../db.js'
import { LIMITS } from '../lib/limits.js'
import { previewInvite, claimPendingInvites, hashInviteToken } from '../lib/invites.js'
import {
  check, heading, fixtureTag, createUser, createShare, addMember, dropUsers,
} from './harness.js'

/**
 * The growth loop: an invite sent to someone with no account has to survive
 * signup and land them in the list. Until this path works the invite email is a
 * dead end, so these are the checks standing between us and a broken funnel.
 */
export default async function run(): Promise<void> {
  const tag = fixtureTag('inv')
  const owner = `${tag}-owner`
  const other = `${tag}-other`
  const joiner = `${tag}-joiner`
  const joinerEmail = `${joiner}@example.test`
  const users = [owner, other, joiner]

  await createUser(owner, 'pro', `${owner}@example.test`)
  await createUser(other, 'pro', `${other}@example.test`)
  const collabId = await createShare(owner, `Groceries ${tag}`)
  const secondCollab = await createShare(other, `Recipes ${tag}`)

  function token(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString('base64url')
    return { raw, hash: hashInviteToken(raw) }
  }

  async function invite(
    collab: number,
    email: string,
    invitedBy: string,
    role: 'viewer' | 'editor' = 'editor',
    expiresInMs = 14 * 24 * 3600_000
  ): Promise<string> {
    const t = token()
    await query(
      `INSERT INTO list_collab_invite
         (collab_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [collab, email, role, t.hash, invitedBy, new Date(Date.now() + expiresInMs)]
    )
    return t.raw
  }

  try {
    heading('invite preview (unauthenticated)')

    const live = await invite(collabId, joinerEmail, owner, 'viewer')
    const seen = await previewInvite(live)
    check('a live invite resolves', 'ok' in seen)
    if ('ok' in seen) {
      check('it names the list', seen.ok.list_name === `Groceries ${tag}`, seen.ok.list_name)
      check('it names the inviter', seen.ok.inviter_name === owner, seen.ok.inviter_name)
      check('it carries the role', seen.ok.role === 'viewer', seen.ok.role)
      check(
        'it reports that the invitee has no account yet, so the page offers signup',
        seen.ok.has_account === false
      )
    }

    check(
      'an unknown token is indistinguishable from a revoked one',
      'error' in (await previewInvite('not-a-real-token')) &&
        (await previewInvite('not-a-real-token') as { error: string }).error === 'not_found'
    )

    const stale = await invite(collabId, `stale-${tag}@example.test`, owner, 'editor', -1000)
    const staleSeen = await previewInvite(stale)
    check(
      'an expired invite says so, rather than looking like a bad link',
      'error' in staleSeen && staleSeen.error === 'invite_expired'
    )

    heading('claiming invites at signup')

    // The account now exists — this is the moment auth.ts's create hook fires.
    await createUser(joiner, null, joinerEmail)
    const claimed = await claimPendingInvites(joiner, joinerEmail)
    check('the waiting invite is attached to the new account', claimed === 1, `${claimed} claimed`)

    const { rows: memberships } = await query<{ collab_id: string; role: string }>(
      `SELECT collab_id, role FROM list_collab_member WHERE user_id = $1`,
      [joiner]
    )
    check('membership exists with the invited role', memberships[0]?.role === 'viewer')
    check('membership is on the right share', Number(memberships[0]?.collab_id) === collabId)

    const { rows: consumed } = await query<{ status: string; accepted_by: string | null }>(
      `SELECT status, accepted_by FROM list_collab_invite WHERE token_hash = $1`,
      [hashInviteToken(live)]
    )
    check(
      'the invite is marked accepted, so the link cannot be reused',
      consumed[0]?.status === 'accepted' && consumed[0]?.accepted_by === joiner
    )
    check(
      'a used token no longer previews',
      'error' in (await previewInvite(live))
    )

    heading('the free-guest cap survives the signup path')

    // A second invite, from a different owner, for the same brand-new account.
    await invite(secondCollab, joinerEmail, other, 'editor')
    const second = await claimPendingInvites(joiner, joinerEmail)
    check(
      `a new account claims at most ${LIMITS.maxSharedLists} shared list, not every invite waiting`,
      second === 0,
      `${second} claimed on the second pass`
    )
    const { rows: stillPending } = await query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count FROM list_collab_invite i
        WHERE i.collab_id = $1 AND i.status = 'pending'`,
      [secondCollab]
    )
    check(
      'the invite beyond the cap stays pending rather than being discarded',
      Number(stillPending[0]?.count) === 1,
      'so upgrading makes it available instead of losing it'
    )

    heading('claiming is not a way around membership rules')

    const ownerSelf = await invite(collabId, `${owner}@example.test`, owner)
    check('an invite to your own list is created for the test', ownerSelf.length > 0)
    const selfClaim = await claimPendingInvites(owner, `${owner}@example.test`)
    check('you cannot become a member of a list you own', selfClaim === 0)

    // Already a member: claiming again must not duplicate or change the role.
    const existing = `${tag}-existing`
    users.push(existing)
    await createUser(existing, 'pro', `${existing}@example.test`)
    await addMember(secondCollab, existing, 'viewer', other)
    await invite(secondCollab, `${existing}@example.test`, other, 'editor')
    await claimPendingInvites(existing, `${existing}@example.test`)
    const { rows: dupe } = await query<{ count: string; role: string }>(
      `SELECT COUNT(*)::TEXT AS count, MIN(role) AS role
         FROM list_collab_member WHERE user_id = $1 AND collab_id = $2`,
      [existing, secondCollab]
    )
    check(
      'an invite for someone already on the list does not duplicate the membership',
      Number(dupe[0]?.count) === 1,
      `${dupe[0]?.count} rows`
    )
  } finally {
    await dropUsers(users)
  }
}
