-- Seed Stash-Squirrel curated list: Job Hunt.
-- Filed under "Other" — the only category with no published list until now.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping job-hunt seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-job-hunt',
    'Job Hunt',
    'Job boards, salary data and interview prep, plus a weekly rhythm that keeps a search moving instead of stalling.',
    '💼',
    'Other',
    'system-stash-squirrel',
    'Job Hunt',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Advice',           'bookmark', 'Ask a Manager',        'https://www.askamanager.org',                 0),
    (v_list_id, 'Advice',           'bookmark', 'The Muse',             'https://www.themuse.com',                     1),
    (v_list_id, 'Advice',           'bookmark', 'National Careers Service', 'https://nationalcareers.service.gov.uk',  2),
    (v_list_id, 'Advice',           'bookmark', 'r/jobs',               'https://www.reddit.com/r/jobs/',              3),

    (v_list_id, 'Interview Prep',   'bookmark', 'interviewing.io',      'https://interviewing.io',                     0),
    (v_list_id, 'Interview Prep',   'bookmark', 'LeetCode',             'https://leetcode.com',                        1),

    (v_list_id, 'Job Boards',       'bookmark', 'LinkedIn',             'https://www.linkedin.com',                    0),
    (v_list_id, 'Job Boards',       'bookmark', 'Indeed',               'https://uk.indeed.com',                       1),
    (v_list_id, 'Job Boards',       'bookmark', 'Welcome to the Jungle', 'https://www.welcometothejungle.com',         2),
    (v_list_id, 'Job Boards',       'bookmark', 'Reed',                 'https://www.reed.co.uk',                      3),
    (v_list_id, 'Job Boards',       'bookmark', 'CV-Library',           'https://www.cv-library.co.uk',                4),
    (v_list_id, 'Job Boards',       'bookmark', 'Find a Job (gov.uk)',  'https://findajob.dwp.gov.uk',                 5),
    (v_list_id, 'Job Boards',       'bookmark', 'Hacker News Who Is Hiring', 'https://news.ycombinator.com',           6),

    (v_list_id, 'Research & Pay',   'bookmark', 'Glassdoor',            'https://www.glassdoor.co.uk',                 0),
    (v_list_id, 'Research & Pay',   'bookmark', 'Levels.fyi',           'https://www.levels.fyi',                      1);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Set Up Once',   'todo', 'Rewrite your CV around outcomes',   'What changed because you were there, with numbers.',             3, 0,  0),
    (v_list_id, 'Set Up Once',   'todo', 'Get two people to read your CV',    'You cannot proofread your own career.',                          2, 0,  1),
    (v_list_id, 'Set Up Once',   'todo', 'Update your LinkedIn to match',     'Recruiters search it whether you like it or not.',               2, 0,  2),
    (v_list_id, 'Set Up Once',   'todo', 'Write a reusable cover letter skeleton', 'Two paragraphs you adapt, not twelve you rewrite.',         2, 0,  3),
    (v_list_id, 'Set Up Once',   'todo', 'Set a target salary and a walk-away number', 'Decide when you are calm, not mid-negotiation.',        2, 0,  4),
    (v_list_id, 'Set Up Once',   'todo', 'Line up three referees and ask them first', '',                                                       2, 0,  5),
    (v_list_id, 'Set Up Once',   'todo', 'Prepare six STAR stories',          'Conflict, failure, leadership, ambiguity, success, learning.',    3, 0,  6),

    (v_list_id, 'Weekly Rhythm', 'todo', 'Apply to five well-matched roles',  'Five tailored beats fifty copy-pasted. Every time.',             3, 7,  0),
    (v_list_id, 'Weekly Rhythm', 'todo', 'Follow up on anything older than a week', 'Politely. It works more often than it should.',            2, 7,  1),
    (v_list_id, 'Weekly Rhythm', 'todo', 'Reach out to one person in the industry', 'Referrals beat applications by a wide margin.',            2, 7,  2),
    (v_list_id, 'Weekly Rhythm', 'todo', 'Do one hour of interview practice', 'Out loud. Recording yourself is even better.',                   2, 7,  3),
    (v_list_id, 'Weekly Rhythm', 'todo', 'Update your application tracker',   'Company, role, date, stage, next action.',                       2, 7,  4),
    (v_list_id, 'Weekly Rhythm', 'todo', 'Take a full day off from searching', 'Job hunting expands to fill all available time. Do not let it.', 2, 7, 5);
END$$;
