-- Seed Stash-Squirrel curated list: Moving House.
--
-- Royal Mail blocks automated access to its entire domain, so mail redirection
-- is a todo without a link rather than an unverified URL.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping moving-house seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-moving-house',
    'Moving House',
    'Everything with a deadline, in the order it needs doing — from booking removals to the meter readings on the day.',
    '📦',
    'Home & Lifestyle',
    'system-stash-squirrel',
    'Moving House',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Change of Address', 'bookmark', 'Tell HMRC (gov.uk)',        'https://www.gov.uk/tell-hmrc-change-of-details',      0),
    (v_list_id, 'Change of Address', 'bookmark', 'Driving Licence (gov.uk)',  'https://www.gov.uk/change-address-driving-licence',   1),
    (v_list_id, 'Change of Address', 'bookmark', 'Council Tax (gov.uk)',      'https://www.gov.uk/council-tax',                      2),
    (v_list_id, 'Change of Address', 'bookmark', 'Register to Vote (gov.uk)', 'https://www.gov.uk/register-to-vote',                 3),

    (v_list_id, 'Services',          'bookmark', 'reallymoving',              'https://www.reallymoving.com',                        0),
    (v_list_id, 'Services',          'bookmark', 'uSwitch',                   'https://www.uswitch.com',                             1),
    (v_list_id, 'Services',          'bookmark', 'Ofcom',                     'https://www.ofcom.org.uk',                            2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, sort_order) VALUES
    (v_list_id, 'Step 1 · Six Weeks Out',  'todo', 'Get three removal quotes',        'Book early for end-of-month and Friday moves.',                    3, 0),
    (v_list_id, 'Step 1 · Six Weeks Out',  'todo', 'Decide what is not coming with you', 'Sell, donate or tip it. You pay to move every box.',            2, 1),
    (v_list_id, 'Step 1 · Six Weeks Out',  'todo', 'Book time off for moving day and the day after', 'You will need both.',                               2, 2),
    (v_list_id, 'Step 1 · Six Weeks Out',  'todo', 'Check parking and access at both ends', 'Some councils need a permit for a removal van.',             2, 3),

    (v_list_id, 'Step 2 · Two Weeks Out',  'todo', 'Set up Royal Mail postal redirection', 'Cheaper than the cost of one missed bank letter.',            3, 0),
    (v_list_id, 'Step 2 · Two Weeks Out',  'todo', 'Notify banks, insurers, employer and GP', '',                                                        3, 1),
    (v_list_id, 'Step 2 · Two Weeks Out',  'todo', 'Update your driving licence and vehicle log book', 'Both are legally required, and free.',            3, 2),
    (v_list_id, 'Step 2 · Two Weeks Out',  'todo', 'Tell HMRC and your council',      'Council tax at both addresses needs closing and opening.',         3, 3),
    (v_list_id, 'Step 2 · Two Weeks Out',  'todo', 'Arrange broadband at the new place', 'Lead times can be weeks. Do this early or work from a hotspot.', 3, 4),
    (v_list_id, 'Step 2 · Two Weeks Out',  'todo', 'Sort buildings and contents insurance from the move date', '',                                       3, 5),
    (v_list_id, 'Step 2 · Two Weeks Out',  'todo', 'Start packing room by room and label by room', 'Label the destination room, not the contents.',       2, 6),

    (v_list_id, 'Step 3 · Moving Day',     'todo', 'Pack an open-me-first box',       'Kettle, mugs, tea, loo roll, chargers, toolkit, meds.',            3, 0),
    (v_list_id, 'Step 3 · Moving Day',     'todo', 'Take meter readings at both properties', 'Photograph them with a timestamp. Disputes happen.',        3, 1),
    (v_list_id, 'Step 3 · Moving Day',     'todo', 'Photograph the condition of the old place', 'Especially if you are renting and want the deposit back.', 2, 2),
    (v_list_id, 'Step 3 · Moving Day',     'todo', 'Hand over every key and check nothing is left', 'Loft, shed, garage, under the stairs.',              2, 3),
    (v_list_id, 'Step 3 · Moving Day',     'todo', 'Find the stopcock and consumer unit at the new place', 'Before you need them at midnight.',           2, 4),
    (v_list_id, 'Step 3 · Moving Day',     'todo', 'Change the locks',                'You have no idea how many keys are out there.',                    2, 5);
END$$;
