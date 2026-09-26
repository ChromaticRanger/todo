import { Router } from 'express'
import { query, pool } from '../db.js'
import { invalidateCollabMemo, isReservedListName } from '../lib/listAccess.js'

const router = Router()

// GET /api/lists — all distinct list names for this user, unioned with any
// user-created empty lists (which app_settings.empty_lists tracks so they
// survive a refresh even though no todo references them yet).
//
// `lists` is the user's OWN list names and its shape is frozen: the browser
// extension consumes exactly `{ lists: string[] }`. Lists shared with the user
// are reported separately under `shared`, keyed by `@<collabId>` rather than by
// name, because two people can each have a list called "Home". Merging them
// into `lists` would make the extension post items into a list it doesn't own.
router.get('/', async (req, res) => {
  const userId = req.userId!
  try {
    const [listsResult, emptyResult, sharedResult, sharedByMeResult] = await Promise.all([
      query<{ list_name: string }>(
        `SELECT DISTINCT list_name FROM todos
         WHERE user_id = $1 AND type <> 'event'`,
        [userId]
      ),
      query<{ value: string[] }>(
        `SELECT value FROM app_settings
         WHERE user_id = $1 AND key = 'empty_lists'`,
        [userId]
      ),
      query<{
        id: string
        member_id: string
        list_name: string
        owner_user_id: string
        role: string
        owner_name: string | null
        owner_email: string
      }>(
        `SELECT c.id, m.id AS member_id, c.list_name, c.owner_user_id, m.role,
                u.name AS owner_name, u.email AS owner_email
           FROM list_collab_member m
           JOIN list_collab c ON c.id = m.collab_id
           JOIN "user" u ON u.id = c.owner_user_id
          WHERE m.user_id = $1
          ORDER BY c.list_name`,
        [userId]
      ),
      query<{
        list_name: string
        id: string
        member_count: string
        pending_invites: string
      }>(
        `SELECT c.id, c.list_name,
                (SELECT COUNT(*) FROM list_collab_member m WHERE m.collab_id = c.id)
                  AS member_count,
                (SELECT COUNT(*) FROM list_collab_invite i
                  WHERE i.collab_id = c.id AND i.status = 'pending'
                    AND i.expires_at > NOW()) AS pending_invites
           FROM list_collab c
          WHERE c.owner_user_id = $1`,
        [userId]
      ),
    ])
    const real = listsResult.rows.map((r) => r.list_name)
    const realSet = new Set(real)
    const stillEmpty = (emptyResult.rows[0]?.value ?? []).filter(
      (n) => !realSet.has(n)
    )
    const all = [...real, ...stillEmpty].sort((a, b) => a.localeCompare(b))

    const shared = sharedResult.rows.map((r) => ({
      key: `@${Number(r.id)}`,
      collab_id: Number(r.id),
      // Their own membership row, so they can leave the share.
      member_id: Number(r.member_id),
      name: r.list_name,
      owner_id: r.owner_user_id,
      owner_name: r.owner_name || r.owner_email,
      role: r.role,
    }))

    const sharedByMe: Record<
      string,
      { collab_id: number; member_count: number; pending_invites: number }
    > = {}
    for (const r of sharedByMeResult.rows) {
      sharedByMe[r.list_name] = {
        collab_id: Number(r.id),
        member_count: Number(r.member_count),
        pending_invites: Number(r.pending_invites),
      }
    }

    res.json({ lists: all, shared, shared_by_me: sharedByMe })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

// PATCH /api/lists/:name — rename a list
//
// Renaming onto an existing name has always silently MERGED the two lists'
// todos, so the collaboration rows have to merge the same way or the rename
// would trip list_collab's UNIQUE (owner_user_id, list_name). The whole thing
// runs in one transaction: todos, the Discover publication, and the share all
// move together or not at all.
//
// Collaborators address a shared list by its collab id, never by name, so a
// rename is invisible to them — their tab and their per-list preferences keep
// working throughout.
router.patch('/:name', async (req, res) => {
  const userId = req.userId!
  const oldName = req.params.name
  const { name: newName } = req.body as { name?: string }
  if (!newName || !newName.trim()) {
    res.status(400).json({ error: 'New name is required' })
    return
  }
  const trimmed = newName.trim()
  // Would collide with the `@<collabId>` key shared lists use on the client.
  if (isReservedListName(trimmed)) {
    res.status(400).json({ error: 'reserved_list_name' })
    return
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      'UPDATE todos SET list_name = $1 WHERE list_name = $2 AND user_id = $3',
      [trimmed, oldName, userId]
    )
    await client.query(
      `UPDATE shared_lists SET original_list_name = $1
        WHERE owner_user_id = $2 AND original_list_name = $3`,
      [trimmed, userId, oldName]
    )

    const { rows: collabRows } = await client.query<{ id: string; list_name: string }>(
      `SELECT id, list_name FROM list_collab
        WHERE owner_user_id = $1 AND list_name IN ($2, $3)
        FOR UPDATE`,
      [userId, oldName, trimmed]
    )
    const src = collabRows.find((r) => r.list_name === oldName)
    const dst = collabRows.find((r) => r.list_name === trimmed)

    if (src && dst && src.id !== dst.id) {
      // Both lists were shared. Fold the source's people into the survivor,
      // keeping the more permissive role where someone was on both.
      await client.query(
        `INSERT INTO list_collab_member (collab_id, user_id, role, invited_by, joined_at)
         SELECT $1, user_id, role, invited_by, joined_at
           FROM list_collab_member WHERE collab_id = $2
         ON CONFLICT (collab_id, user_id) DO UPDATE
           SET role = CASE
                        WHEN list_collab_member.role = 'editor'
                          OR EXCLUDED.role = 'editor' THEN 'editor'
                        ELSE 'viewer'
                      END`,
        [dst.id, src.id]
      )
      // Carry over pending invites that don't duplicate one on the survivor;
      // the rest disappear with the source row's cascade.
      await client.query(
        `UPDATE list_collab_invite i SET collab_id = $1
          WHERE i.collab_id = $2 AND i.status = 'pending'
            AND NOT EXISTS (
              SELECT 1 FROM list_collab_invite d
               WHERE d.collab_id = $1 AND d.status = 'pending'
                 AND lower(d.email) = lower(i.email)
            )`,
        [dst.id, src.id]
      )
      await client.query('DELETE FROM list_collab WHERE id = $1', [src.id])
      await client.query(
        `UPDATE list_collab SET content_changed_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [dst.id]
      )
    } else if (src) {
      await client.query(
        `UPDATE list_collab SET list_name = $1, updated_at = NOW() WHERE id = $2`,
        [trimmed, src.id]
      )
    }

    await client.query('COMMIT')
    invalidateCollabMemo(userId, oldName)
    invalidateCollabMemo(userId, trimmed)
    res.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

// DELETE /api/lists/:name — delete all todos in a list
//
// Also tears down the share, so collaborators don't keep a ghost tab pointing
// at a list that no longer exists. Members and pending invites go with it via
// the cascade on list_collab.
router.delete('/:name', async (req, res) => {
  const userId = req.userId!
  const listName = req.params.name
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      'DELETE FROM todos WHERE list_name = $1 AND user_id = $2',
      [listName, userId]
    )
    await client.query(
      'DELETE FROM list_collab WHERE owner_user_id = $1 AND list_name = $2',
      [userId, listName]
    )
    await client.query('COMMIT')
    invalidateCollabMemo(userId, listName)
    res.json({ deleted: result.rowCount })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    res.status(500).json({ error: String(err) })
  } finally {
    client.release()
  }
})

export default router
