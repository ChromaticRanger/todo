import { query } from '../db.js'

/**
 * Delete ephemeral demo users (and their cascaded data) older than MAX_AGE.
 *
 * Each /api/demo/start mints a `demo-<uuid>` user with cloned seed data, and
 * the visitor's session writes accumulate against it. They never sign in
 * again, so without this the rows linger forever — and since the seed template
 * is ~116 items, each visitor leaves that many behind. This is the only part
 * of the schema that grows with traffic rather than with real users.
 *
 * Lives here rather than in scripts/ so the in-process scheduler and the
 * `cleanup:demo` CLI share one implementation.
 */

const MAX_AGE_HOURS = 24

export interface DemoCleanupSummary {
  deleted: number
}

export async function cleanupDemoUsers(): Promise<DemoCleanupSummary> {
  // CASCADE on the user FK cleans up session, account, todos, app_settings and
  // shared_lists rows for the deleted ephemeral users. Demos parked by a
  // pending_demo_carryover row are excluded — they're waiting for a signed-up
  // visitor to pick their plan.
  //
  // Safe to run concurrently from several instances: the DELETE is idempotent,
  // and a row already removed by another runner simply isn't returned.
  const result = await query<{ id: string }>(
    `DELETE FROM "user"
      WHERE id LIKE 'demo-%'
        AND id <> 'demo-user'
        AND "createdAt" < NOW() - INTERVAL '${MAX_AGE_HOURS} hours'
        AND id NOT IN (
          SELECT value->>'demoUserId' FROM app_settings
           WHERE key = 'pending_demo_carryover'
        )
      RETURNING id`
  )
  return { deleted: result.rowCount ?? 0 }
}
