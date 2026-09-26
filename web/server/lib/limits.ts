import { query } from '../db.js'

export const LIMITS = {
  maxLists: Number(process.env.FREE_TIER_MAX_LISTS ?? 3),
  maxItems: Number(process.env.FREE_TIER_MAX_ITEMS ?? 50),
  // Shared lists a free user may be a member of. Sharing itself is Pro-only,
  // but accepting is free so an invited stranger sees the product working
  // before hitting a paywall. This cap is what stops a free account running
  // its whole life inside someone else's Pro subscription.
  maxSharedLists: Number(process.env.FREE_TIER_MAX_SHARED_LISTS ?? 1),
}

/**
 * The tier of an arbitrary user — not necessarily the caller.
 *
 * Needed because items in a shared list are stored under the OWNER's user_id,
 * so the free-tier caps must be evaluated against the owner even when a
 * collaborator is the one adding the item. `req.plan` is the caller's tier and
 * is the wrong subject in that case.
 */
export async function getUserPlan(userId: string): Promise<'free' | 'pro' | null> {
  const { rows } = await query<{ tier: string | null }>(
    'SELECT tier FROM "user" WHERE id = $1',
    [userId]
  )
  const tier = rows[0]?.tier
  return tier === 'free' || tier === 'pro' ? tier : null
}

export async function countUserLists(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(DISTINCT list_name)::TEXT AS count FROM todos
     WHERE user_id = $1 AND type <> 'event'`,
    [userId]
  )
  return Number(rows[0]?.count ?? 0)
}

export async function userHasList(userId: string, listName: string): Promise<boolean> {
  const { rowCount } = await query(
    `SELECT 1 FROM todos
     WHERE user_id = $1 AND list_name = $2 AND type <> 'event'
     LIMIT 1`,
    [userId, listName]
  )
  return (rowCount ?? 0) > 0
}

export async function countUserItems(userId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM todos
     WHERE user_id = $1 AND type <> 'event'`,
    [userId]
  )
  return Number(rows[0]?.count ?? 0)
}
