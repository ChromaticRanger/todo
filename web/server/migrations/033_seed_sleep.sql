-- Seed Stash-Squirrel curated list: Sleep & Recovery.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping sleep seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-sleep-recovery',
    'Sleep & Recovery',
    'A wind-down routine that repeats nightly, plus the science, apps and trackers worth knowing about.',
    '😴',
    'Health & Wellness',
    'system-stash-squirrel',
    'Sleep & Recovery',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Apps & Tools',      'bookmark', 'Sleepio',              'https://www.sleepio.com',        0),
    (v_list_id, 'Apps & Tools',      'bookmark', 'Calm',                 'https://www.calm.com',           1),
    (v_list_id, 'Apps & Tools',      'bookmark', 'Headspace',            'https://www.headspace.com',      2),
    (v_list_id, 'Apps & Tools',      'bookmark', 'Sleep Cycle',          'https://www.sleepcycle.com',     3),
    (v_list_id, 'Apps & Tools',      'bookmark', 'f.lux',                'https://justgetflux.com',        4),

    (v_list_id, 'Community',         'bookmark', 'r/sleep',              'https://www.reddit.com/r/sleep/', 0),

    (v_list_id, 'Learn the Science', 'bookmark', 'NHS Sleep and Tiredness', 'https://www.nhs.uk/live-well/sleep-and-tiredness/', 0),
    (v_list_id, 'Learn the Science', 'bookmark', 'Sleep Foundation',     'https://www.sleepfoundation.org', 1),
    (v_list_id, 'Learn the Science', 'bookmark', 'AASM Sleep Education', 'https://sleepeducation.org',      2),
    (v_list_id, 'Learn the Science', 'bookmark', 'Huberman Sleep Toolkit', 'https://www.hubermanlab.com/newsletter/toolkit-for-sleep', 3),

    (v_list_id, 'Trackers',          'bookmark', 'Oura Ring',            'https://ouraring.com',            0),
    (v_list_id, 'Trackers',          'bookmark', 'Whoop',                'https://www.whoop.com',           1);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Nightly Wind-Down', 'todo', 'Last caffeine of the day',        'Aim for eight hours before bed — it has a long half-life.', 2, 1,  0),
    (v_list_id, 'Nightly Wind-Down', 'todo', 'Screens off 30 minutes before bed', 'Or at least out of the bedroom.',                         2, 1,  1),
    (v_list_id, 'Nightly Wind-Down', 'todo', 'Dim the lights and drop the heat', 'A cool, dark room beats a warm one.',                      1, 1,  2),
    (v_list_id, 'Nightly Wind-Down', 'todo', 'Same bedtime, same wake time',     'Consistency matters more than total hours.',               2, 1,  3),
    (v_list_id, 'Nightly Wind-Down', 'todo', 'Brain-dump tomorrow onto paper',   'Gets the loop out of your head before it starts.',         1, 1,  4),

    (v_list_id, 'Weekly & Monthly',  'todo', 'Get morning daylight every day this week', 'Ten minutes outside within an hour of waking.',    2, 7,  0),
    (v_list_id, 'Weekly & Monthly',  'todo', 'Review the week''s sleep pattern',  'What shifted on the bad nights?',                         1, 7,  1),
    (v_list_id, 'Weekly & Monthly',  'todo', 'Wash bedding',                      '',                                                       1, 7,  2),
    (v_list_id, 'Weekly & Monthly',  'todo', 'Bedroom audit: light, noise, temperature', 'Blackout, earplugs, thermostat. Fix one thing.',   1, 30, 3),
    (v_list_id, 'Weekly & Monthly',  'todo', 'Review caffeine and alcohol habits', 'Both wreck deep sleep more than people expect.',         1, 30, 4);
END$$;
