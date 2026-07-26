-- Seed Stash-Squirrel curated list: Home Barista.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping barista seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-home-barista',
    'Home Barista',
    'Dialling in espresso, brewing better filter, where to buy beans that were roasted this month — and the descaling you keep forgetting.',
    '☕',
    'Food & Drink',
    'system-stash-squirrel',
    'Home Barista',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Beans',            'bookmark', 'Hasbean',              'https://www.hasbean.co.uk',           0),
    (v_list_id, 'Beans',            'bookmark', 'Square Mile Coffee',   'https://shop.squaremilecoffee.com',   1),
    (v_list_id, 'Beans',            'bookmark', 'Origin Coffee',        'https://www.origincoffee.co.uk',      2),
    (v_list_id, 'Beans',            'bookmark', 'Union Hand-Roasted',   'https://unionroasted.com',            3),
    (v_list_id, 'Beans',            'bookmark', 'Rave Coffee',          'https://ravecoffee.co.uk',            4),
    (v_list_id, 'Beans',            'bookmark', 'Sweet Maria''s (green beans)', 'https://www.sweetmarias.com', 5),

    (v_list_id, 'Community',        'bookmark', 'Home-Barista Forum',   'https://www.home-barista.com',        0),
    (v_list_id, 'Community',        'bookmark', 'r/Coffee',             'https://www.reddit.com/r/Coffee/',    1),
    (v_list_id, 'Community',        'bookmark', 'r/espresso',           'https://www.reddit.com/r/espresso/',  2),

    (v_list_id, 'Learn the Craft',  'bookmark', 'James Hoffmann',       'https://www.youtube.com/@jameshoffmann', 0),
    (v_list_id, 'Learn the Craft',  'bookmark', 'Barista Hustle',       'https://www.baristahustle.com',       1),
    (v_list_id, 'Learn the Craft',  'bookmark', 'Coffee ad Astra',      'https://coffeeadastra.com',           2),
    (v_list_id, 'Learn the Craft',  'bookmark', 'Perfect Daily Grind',  'https://perfectdailygrind.com',       3);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, repeat_months, sort_order) VALUES
    (v_list_id, 'Kit & Routine', 'todo', 'Purge and wipe the group head',    'Ten seconds after every session.',                          1, 1,  0, 0),
    (v_list_id, 'Kit & Routine', 'todo', 'Weigh in and weigh out',           'Dose, yield, time. Without numbers you are just guessing.',  2, 1,  0, 1),
    (v_list_id, 'Kit & Routine', 'todo', 'Backflush with water',             '',                                                          1, 7,  0, 2),
    (v_list_id, 'Kit & Routine', 'todo', 'Order beans before you run out',   'Rest them 7-14 days off roast for espresso.',                2, 14, 0, 3),
    (v_list_id, 'Kit & Routine', 'todo', 'Backflush with detergent',         'Then clean the portafilter baskets properly.',               2, 30, 0, 4),
    (v_list_id, 'Kit & Routine', 'todo', 'Clean the grinder burrs',          'Stale grounds taste exactly as bad as they sound.',          2, 0,  3, 5),
    (v_list_id, 'Kit & Routine', 'todo', 'Descale the machine',              'Frequency depends on your water hardness — check the manual.', 3, 0, 6, 6);
END$$;
