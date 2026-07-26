-- Seed Stash-Squirrel curated list: Cycling.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping cycling seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-cycling',
    'Cycling',
    'Route planning, indoor training, maintenance references and a service schedule that keeps the bike running.',
    '🚴',
    'Sports & Fitness',
    'system-stash-squirrel',
    'Cycling',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Community',         'bookmark', 'r/cycling',           'https://www.reddit.com/r/cycling/',      0),
    (v_list_id, 'Community',         'bookmark', 'r/bikewrench',        'https://www.reddit.com/r/bikewrench/',   1),
    (v_list_id, 'Community',         'bookmark', 'Cycling UK',          'https://www.cyclinguk.org',              2),
    (v_list_id, 'Community',         'bookmark', 'Sustrans',            'https://www.sustrans.org.uk',            3),

    (v_list_id, 'Maintenance',       'bookmark', 'Park Tool Repair Help', 'https://www.parktool.com/blog/repair-help', 0),
    (v_list_id, 'Maintenance',       'bookmark', 'Sheldon Brown',       'https://www.sheldonbrown.com',           1),
    (v_list_id, 'Maintenance',       'bookmark', 'Tredz',               'https://www.tredz.co.uk',                2),

    (v_list_id, 'News & Watching',   'bookmark', 'BikeRadar',           'https://www.bikeradar.com',              0),
    (v_list_id, 'News & Watching',   'bookmark', 'Cycling Weekly',      'https://www.cyclingweekly.com',          1),
    (v_list_id, 'News & Watching',   'bookmark', 'Escape Collective',   'https://escapecollective.com',           2),
    (v_list_id, 'News & Watching',   'bookmark', 'GCN',                 'https://www.youtube.com/@gcn',           3),

    (v_list_id, 'Routes & Training', 'bookmark', 'komoot',              'https://www.komoot.com',                 0),
    (v_list_id, 'Routes & Training', 'bookmark', 'Ride with GPS',       'https://ridewithgps.com',                1),
    (v_list_id, 'Routes & Training', 'bookmark', 'Strava',              'https://www.strava.com',                 2),
    (v_list_id, 'Routes & Training', 'bookmark', 'Zwift',               'https://www.zwift.com',                  3),
    (v_list_id, 'Routes & Training', 'bookmark', 'TrainerRoad',         'https://www.trainerroad.com',            4);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, repeat_months, sort_order) VALUES
    (v_list_id, 'Service Schedule', 'todo', 'Check tyre pressure',           'Before every ride, honestly. It matters more than anything else.', 2, 7,  0, 0),
    (v_list_id, 'Service Schedule', 'todo', 'Clean and re-lube the chain',   'Wet lube in winter, dry in summer.',                              2, 7,  0, 1),
    (v_list_id, 'Service Schedule', 'todo', 'Quick M-check before a long ride', 'Bars, brakes, wheels, tyres, chain. Two minutes.',              2, 7,  0, 2),
    (v_list_id, 'Service Schedule', 'todo', 'Check brake pads and cables',   '',                                                                2, 30, 0, 3),
    (v_list_id, 'Service Schedule', 'todo', 'Measure chain wear',            'A worn chain quietly destroys the cassette.',                     2, 30, 0, 4),
    (v_list_id, 'Service Schedule', 'todo', 'Check bolt torques',            'Stem, seatpost, bottle cages.',                                   1, 30, 0, 5),
    (v_list_id, 'Service Schedule', 'todo', 'Full strip, clean and re-grease', 'Or book it into a shop if that is not your thing.',              1, 0,  6, 6);
END$$;
