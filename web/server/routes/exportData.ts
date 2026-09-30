import { Router } from 'express'
import { query } from '../db.js'

/**
 * Data export — everything the account holds, as one JSON file.
 *
 * Exists for two reasons. Article 20 of the UK/EU GDPR gives people a right to
 * receive their personal data "in a structured, commonly used and
 * machine-readable format", which account deletion (Article 17) does not
 * satisfy on its own. And a paid product that holds your todos, bookmarks and
 * notes should be able to answer "can I get my data out" with a yes.
 *
 * Scope is deliberately "rows owned by this user". Items in a list shared WITH
 * them belong to the list's owner and are that person's export, not theirs —
 * but items a collaborator added to a list they own ARE included, because
 * those rows carry the owner's user_id. The payload says so, rather than
 * leaving the reader to work it out.
 */

const router = Router()

/** Bumped if the shape ever changes, so an importer can tell the difference. */
const EXPORT_VERSION = 1

router.get('/', async (req, res) => {
  const userId = req.userId!
  try {
    const [profile, items, settings, publications, overrides] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT id, name, email, "emailVerified", tier, "createdAt"
           FROM "user" WHERE id = $1`,
        [userId]
      ),
      query<Record<string, unknown>>(
        `SELECT id, list_name, category, type, title, description, url,
                priority, status, due_date, repeat_days, repeat_months,
                recur_until, duration_seconds, color, all_day, snoozed_until,
                created_at, completed_at, created_by_user_id
           FROM todos WHERE user_id = $1
           ORDER BY list_name, category, id`,
        [userId]
      ),
      query<Record<string, unknown>>(
        `SELECT key, value, updated_at FROM app_settings WHERE user_id = $1
          ORDER BY key`,
        [userId]
      ),
      query<Record<string, unknown>>(
        `SELECT slug, name, description, category, original_list_name,
                published_at, updated_at
           FROM shared_lists WHERE owner_user_id = $1
           ORDER BY published_at`,
        [userId]
      ),
      query<Record<string, unknown>>(
        `SELECT series_id, occurrence_start, new_due_date, new_duration_seconds
           FROM event_overrides WHERE user_id = $1
           ORDER BY series_id, occurrence_start`,
        [userId]
      ),
    ])

    const payload = {
      export_version: EXPORT_VERSION,
      exported_at: new Date().toISOString(),
      notes: [
        'Items are every todo, bookmark, note and event stored against this account.',
        'A list shared with you belongs to the person who owns it, so its items are in their export, not this one.',
        'Items a collaborator added to a list you own are included here, because they are stored against your account.',
        'Settings are the raw preference rows: theme, layout per list, category order and similar.',
        'created_by_user_id on an item is set only when someone other than you added it to a list you own.',
      ],
      profile: profile.rows[0] ?? null,
      items: items.rows,
      settings: settings.rows,
      published_lists: publications.rows,
      event_overrides: overrides.rows,
      counts: {
        items: items.rows.length,
        settings: settings.rows.length,
        published_lists: publications.rows.length,
      },
    }

    const stamp = new Date().toISOString().slice(0, 10)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="stash-squirrel-export-${stamp}.json"`
    )
    res.type('application/json').send(JSON.stringify(payload, null, 2))
  } catch (err) {
    console.error('[export] failed:', err)
    res.status(500).json({ error: 'export_failed' })
  }
})

export default router
