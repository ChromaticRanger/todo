-- Seed Stash-Squirrel curated list: New Baby.
-- UK-specific for the registration and benefits steps.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping new-baby seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-new-baby',
    'New Baby',
    'What to sort before the birth and what has a deadline after it, plus the NHS and charity resources worth trusting.',
    '👶',
    'Home & Lifestyle',
    'system-stash-squirrel',
    'New Baby',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Admin & Money',    'bookmark', 'Register a Birth (gov.uk)',   'https://www.gov.uk/register-birth',        0),
    (v_list_id, 'Admin & Money',    'bookmark', 'Child Benefit (gov.uk)',      'https://www.gov.uk/child-benefit',         1),
    (v_list_id, 'Admin & Money',    'bookmark', 'Maternity Pay & Leave (gov.uk)', 'https://www.gov.uk/maternity-pay-leave', 2),

    (v_list_id, 'Community & Gear', 'bookmark', 'NCT',                         'https://www.nct.org.uk',                   0),
    (v_list_id, 'Community & Gear', 'bookmark', 'BabyCentre',                  'https://www.babycentre.co.uk',             1),
    (v_list_id, 'Community & Gear', 'bookmark', 'Which? Pushchair Reviews',    'https://www.which.co.uk/reviews/pushchairs', 2),
    (v_list_id, 'Community & Gear', 'bookmark', 'r/beyondthebump',             'https://www.reddit.com/r/beyondthebump/',  3),

    (v_list_id, 'Health & Safety',  'bookmark', 'NHS Pregnancy',               'https://www.nhs.uk/pregnancy/',            0),
    (v_list_id, 'Health & Safety',  'bookmark', 'NHS Start for Life',          'https://www.nhs.uk/start-for-life/',       1),
    (v_list_id, 'Health & Safety',  'bookmark', 'The Lullaby Trust',           'https://www.lullabytrust.org.uk',          2),
    (v_list_id, 'Health & Safety',  'bookmark', 'Tommy''s',                    'https://www.tommys.org',                   3);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, sort_order) VALUES
    (v_list_id, 'Step 1 · Before the Birth', 'todo', 'Tell your employer and confirm your leave dates', 'There are notice deadlines — check them early.',     3, 0),
    (v_list_id, 'Step 1 · Before the Birth', 'todo', 'Book antenatal classes',           'They fill up months ahead in some areas.',                          2, 1),
    (v_list_id, 'Step 1 · Before the Birth', 'todo', 'Fit the car seat and practise with it', 'You cannot legally leave hospital without one fitted properly.', 3, 2),
    (v_list_id, 'Step 1 · Before the Birth', 'todo', 'Set up a safe sleep space',        'Firm, flat, clear. Follow Lullaby Trust guidance.',                  3, 3),
    (v_list_id, 'Step 1 · Before the Birth', 'todo', 'Pack the hospital bag',            'One for you, one for the baby, one for your partner.',               2, 4),
    (v_list_id, 'Step 1 · Before the Birth', 'todo', 'Write a rough birth preference note', 'Preferences, not a plan. Things change.',                         2, 5),
    (v_list_id, 'Step 1 · Before the Birth', 'todo', 'Batch-cook and freeze meals',      'The single most useful thing you can do in the last month.',         2, 6),
    (v_list_id, 'Step 1 · Before the Birth', 'todo', 'Agree who visits, when, and for how long', 'Decide this before you are exhausted and can''t say no.',    2, 7),

    (v_list_id, 'Step 2 · First Six Weeks',  'todo', 'Register the birth',               'Within 42 days in England and Wales, 21 in Scotland.',               3, 0),
    (v_list_id, 'Step 2 · First Six Weeks',  'todo', 'Claim Child Benefit',              'Claim even if you earn too much — it protects your NI record.',      3, 1),
    (v_list_id, 'Step 2 · First Six Weeks',  'todo', 'Register with your GP',            '',                                                                  2, 2),
    (v_list_id, 'Step 2 · First Six Weeks',  'todo', 'Go to the newborn checks and health visitor appointments', '',                                          3, 3),
    (v_list_id, 'Step 2 · First Six Weeks',  'todo', 'Add the baby to your life insurance and will', 'Name guardians. Nobody wants to, everybody should.',     2, 4),
    (v_list_id, 'Step 2 · First Six Weeks',  'todo', 'Book the six-week postnatal check', 'For the mother, not just the baby. It matters.',                    3, 5),
    (v_list_id, 'Step 2 · First Six Weeks',  'todo', 'Ask for help out loud',            'Specific asks work: a shop run, an hour of sleep, a load of washing.', 2, 6);
END$$;
