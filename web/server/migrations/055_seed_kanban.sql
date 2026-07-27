-- Seed Stash-Squirrel curated list: Kanban Board.
--
-- Columns are numbered ("1 · Backlog") on purpose. Categories render in the
-- user's saved order, and a freshly cloned list has none — so todoStore's
-- defaultCategorySort falls back to alphabetical, which would scramble the
-- workflow into Backlog, Blocked, Done, In Progress, In Review, On Hold...
-- The numeric prefix keeps left-to-right flow order intact. Users can drag
-- the categories into any order they like afterwards; the prefix is only
-- there to make the default correct.
--
-- Blocked and On Hold sit at the end rather than mid-flow: they are holding
-- pens that work can enter from any stage, not stages in their own right.
--
-- Todo-only, like the Household Chores seed. No repeats — these are work
-- items, not recurring chores.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping kanban seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-kanban-board',
    'Kanban Board',
    'A software development board with the full workflow: backlog through to done, plus Blocked and On Hold. Comes with worked examples in every column — clear them out and drop your own work in.',
    '📋',
    'Technology',
    'system-stash-squirrel',
    'Kanban Board',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, sort_order) VALUES
    -- Unprioritised intake. Anything can land here; nothing is a commitment.
    (v_list_id, '1 · Backlog', 'todo', 'Investigate slow dashboard query on large accounts', 'Reported by two customers over 50k rows. Needs profiling before it can be estimated.', 2, 0),
    (v_list_id, '1 · Backlog', 'todo', 'Add dark mode to the settings page',            'Frequently requested. Design has not been started.',                        1, 1),
    (v_list_id, '1 · Backlog', 'todo', 'Upgrade to the next Node LTS',                 'Check native dependencies and the CI image first.',                         1, 2),
    (v_list_id, '1 · Backlog', 'todo', 'Reduce bundle size',                           'Audit the ten largest dependencies and look for duplicates.',               1, 3),
    (v_list_id, '1 · Backlog', 'todo', 'Write an ADR for background job processing',   'Queue vs cron vs external worker. Decide before anyone builds it.',         1, 4),
    (v_list_id, '1 · Backlog', 'todo', 'Spike: is our search good enough at 10x data?', 'Timebox to one day. Outcome is a recommendation, not an implementation.',   1, 5),

    -- Groomed, estimated, and agreed. The next thing anyone picks up.
    (v_list_id, '2 · Selected for Development', 'todo', 'Fix timezone bug on recurring reminders', 'Reminders fire an hour early for users observing DST. Repro steps in the ticket.', 3, 0),
    (v_list_id, '2 · Selected for Development', 'todo', 'Add rate limiting to the public API', 'Per-token bucket. Agreed limits are in the RFC.',                    2, 1),
    (v_list_id, '2 · Selected for Development', 'todo', 'Paginate the audit log endpoint', 'Currently returns the full history and times out past ~20k rows.',       2, 2),
    (v_list_id, '2 · Selected for Development', 'todo', 'Add an end-to-end test for the signup flow', 'Our most critical path has the least coverage.',              2, 3),

    -- WIP limit lives here. If this column is full, help finish something.
    (v_list_id, '3 · In Progress', 'todo', 'Implement the password reset flow',        'Token generation and expiry done. Email templates and the reset form still to do.', 3, 0),
    (v_list_id, '3 · In Progress', 'todo', 'Refactor auth middleware to share session lookup', 'Three routes currently duplicate the same query.',                   2, 1),

    -- Waiting on another human. Review is a queue, so keep it short.
    (v_list_id, '4 · In Review', 'todo', 'PR #482 · Extract the billing webhook handler', 'Two approvals needed because it touches payment code.',                   2, 0),
    (v_list_id, '4 · In Review', 'todo', 'PR #479 · Add an index to todos.completed_at', 'Needs a migration review as well as a code review.',                       2, 1),
    (v_list_id, '4 · In Review', 'todo', 'PR #476 · Tighten CSP headers',              'Author is on leave — reassign or take it over.',                             1, 2),

    -- Merged but not trusted yet.
    (v_list_id, '5 · Testing', 'todo', 'Verify SSO login against the staging IdP',     'Covers both SAML and OIDC paths.',                                           2, 0),
    (v_list_id, '5 · Testing', 'todo', 'Regression test attachment upload on Safari',  'Broke twice before on the same browser. Check iOS as well as desktop.',      2, 1),
    (v_list_id, '5 · Testing', 'todo', 'Load test the new export endpoint',            'Target is 200 concurrent requests without the queue backing up.',            2, 2),

    -- Shipped and verified in production. Everything else is inventory.
    (v_list_id, '6 · Done', 'todo', 'Migrate CI from Jenkins to GitHub Actions',       'Build time down from 14 minutes to 5.',                                      1, 0),
    (v_list_id, '6 · Done', 'todo', 'Ship search filters to production',               'Behind a flag for a week, now on for everyone.',                             1, 1),
    (v_list_id, '6 · Done', 'todo', 'Add structured logging to the API',               'Every request now carries a correlation id.',                                1, 2),

    -- Not a stage — a holding pen. Work enters from wherever it stalled.
    -- Note where it came from, and who you are waiting on.
    (v_list_id, '7 · Blocked', 'todo', 'Enable SSO for the enterprise tier',           'Was In Progress. Waiting on the vendor to provision a sandbox tenant — chased 3 days ago.', 3, 0),
    (v_list_id, '7 · Blocked', 'todo', 'Drop the legacy user table',                   'Was Selected. Blocked until the reporting pipeline stops reading from it.',  2, 1),
    (v_list_id, '7 · Blocked', 'todo', 'Renew the code signing certificate',           'Was In Progress. Waiting on finance to approve the purchase order.',         3, 2),

    -- Deliberately paused. Unlike Blocked, nobody is waiting on anyone —
    -- this is a priority decision, and it needs a date to revisit.
    (v_list_id, '8 · On Hold', 'todo', 'Mobile push notifications',                    'Deprioritised this quarter. Revisit at the next planning session.',          1, 0),
    (v_list_id, '8 · On Hold', 'todo', 'GraphQL gateway proof of concept',             'Paused pending headcount. Spike notes are in the wiki if it comes back.',    1, 1),
    (v_list_id, '8 · On Hold', 'todo', 'Redesign the onboarding flow',                 'Parked until the new brand guidelines land.',                                1, 2);
END$$;
