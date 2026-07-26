-- Seed Stash-Squirrel curated list: Gardening Year.
--
-- First list to use repeat_months rather than repeat_days — garden jobs run on
-- a monthly cadence, and a 30-day repeat would drift against the calendar.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping gardening seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-gardening-year',
    'Gardening Year',
    'Monthly jobs that repeat with the calendar, plus seed suppliers, plant ID tools and the growers worth following.',
    '🌱',
    'Hobbies & Crafts',
    'system-stash-squirrel',
    'Gardening Year',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Plant ID & Reference', 'bookmark', 'RHS',                 'https://www.rhs.org.uk',              0),
    (v_list_id, 'Plant ID & Reference', 'bookmark', 'RHS Advice',          'https://www.rhs.org.uk/advice',       1),
    (v_list_id, 'Plant ID & Reference', 'bookmark', 'PlantNet',            'https://plantnet.org',                2),
    (v_list_id, 'Plant ID & Reference', 'bookmark', 'PictureThis',         'https://www.picturethisai.com',       3),
    (v_list_id, 'Plant ID & Reference', 'bookmark', 'Garden Organic',      'https://www.gardenorganic.org.uk',    4),

    (v_list_id, 'Seeds & Suppliers',    'bookmark', 'Chiltern Seeds',      'https://www.chilternseeds.co.uk',     0),
    (v_list_id, 'Seeds & Suppliers',    'bookmark', 'Real Seeds',          'https://www.realseeds.co.uk',         1),
    (v_list_id, 'Seeds & Suppliers',    'bookmark', 'Thompson & Morgan',   'https://www.thompson-morgan.com',     2),
    (v_list_id, 'Seeds & Suppliers',    'bookmark', 'Suttons',             'https://www.suttons.co.uk',           3),

    (v_list_id, 'Watch & Read',         'bookmark', 'Gardeners'' World',   'https://www.gardenersworld.com',      0),
    (v_list_id, 'Watch & Read',         'bookmark', 'Charles Dowding',     'https://charlesdowding.co.uk',        1),
    (v_list_id, 'Watch & Read',         'bookmark', 'r/gardening',         'https://www.reddit.com/r/gardening/', 2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, repeat_months, sort_order) VALUES
    (v_list_id, 'Every Month',  'todo', 'Sow what is in season',            'Check the RHS month-by-month guide before you buy anything.', 2, 0, 1, 0),
    (v_list_id, 'Every Month',  'todo', 'Weed the beds properly',           'An hour now saves a weekend later.',                          2, 0, 1, 1),
    (v_list_id, 'Every Month',  'todo', 'Feed pots and containers',         'They run out of nutrients far faster than beds.',             1, 0, 1, 2),
    (v_list_id, 'Every Month',  'todo', 'Check for pests and disease',      'Undersides of leaves, new growth, base of stems.',            1, 0, 1, 3),
    (v_list_id, 'Every Month',  'todo', 'Top up the compost heap and turn it', '',                                                        1, 0, 1, 4),
    (v_list_id, 'Every Month',  'todo', 'Clean and sharpen your tools',     'Secateurs especially — blunt cuts invite disease.',           1, 0, 1, 5),

    (v_list_id, 'Every Week',   'todo', 'Water deeply, not often',          'Encourages roots down rather than sideways.',                 2, 7, 0, 0),
    (v_list_id, 'Every Week',   'todo', 'Deadhead and harvest',             'Both push the plant into producing more.',                    2, 7, 0, 1),
    (v_list_id, 'Every Week',   'todo', 'Walk the garden and write one note', 'What is thriving, what is sulking, what needs moving.',     1, 7, 0, 2);
END$$;
