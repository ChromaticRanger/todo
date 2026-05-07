import { query } from '../db.js'

export const LIMITS = {
  maxLists: Number(process.env.FREE_TIER_MAX_LISTS ?? 3),
  maxItems: Number(process.env.FREE_TIER_MAX_ITEMS ?? 50),
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
