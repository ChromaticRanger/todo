-- Seed Stash-Squirrel curated list: Home Bread Baking.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping bread seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-home-bread',
    'Home Bread Baking',
    'Sourdough starter care on a daily repeat, a weekly bake day, and the recipes, channels and flour suppliers to make it work.',
    '🍞',
    'Hobbies & Crafts',
    'system-stash-squirrel',
    'Home Bread Baking',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Community',          'bookmark', 'r/Breadit',            'https://www.reddit.com/r/Breadit/',   0),
    (v_list_id, 'Community',          'bookmark', 'r/Sourdough',          'https://www.reddit.com/r/Sourdough/', 1),

    (v_list_id, 'Flour & Kit',        'bookmark', 'Shipton Mill',         'https://www.shipton-mill.com',        0),
    (v_list_id, 'Flour & Kit',        'bookmark', 'Doves Farm',           'https://www.dovesfarm.co.uk',         1),
    (v_list_id, 'Flour & Kit',        'bookmark', 'BakeryBits',           'https://www.bakerybits.co.uk',        2),
    (v_list_id, 'Flour & Kit',        'bookmark', 'Bread Ahead',          'https://www.breadahead.com',          3),

    (v_list_id, 'Recipes & Method',   'bookmark', 'King Arthur Baking',   'https://www.kingarthurbaking.com',    0),
    (v_list_id, 'Recipes & Method',   'bookmark', 'The Perfect Loaf',     'https://www.theperfectloaf.com',      1),
    (v_list_id, 'Recipes & Method',   'bookmark', 'Breadtopia',           'https://breadtopia.com',              2),
    (v_list_id, 'Recipes & Method',   'bookmark', 'Foodgeek',             'https://foodgeek.dk',                 3),

    (v_list_id, 'Watch & Learn',      'bookmark', 'Bake with Jack',       'https://www.youtube.com/@Bakewithjack',    0),
    (v_list_id, 'Watch & Learn',      'bookmark', 'Full Proof Baking',    'https://www.youtube.com/@FullProofBaking', 1),
    (v_list_id, 'Watch & Learn',      'bookmark', 'ChainBaker',           'https://www.youtube.com/@ChainBaker',      2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Starter & Bake Days', 'todo', 'Feed the starter',              'Discard down, then equal parts starter, flour and water.',   2, 1,  0),
    (v_list_id, 'Starter & Bake Days', 'todo', 'Bake day: mix and bulk ferment', 'Pick the loaf the night before so the timings work.',       2, 7,  1),
    (v_list_id, 'Starter & Bake Days', 'todo', 'Use up the discard',            'Crackers, pancakes, pizza base — do not bin it.',            1, 7,  2),
    (v_list_id, 'Starter & Bake Days', 'todo', 'Note what changed and how it baked', 'Hydration, timings, oven temp. One line is enough.',    1, 7,  3),
    (v_list_id, 'Starter & Bake Days', 'todo', 'Try a loaf you have never made', 'Rye, focaccia, bagels, brioche.',                           1, 30, 4),
    (v_list_id, 'Starter & Bake Days', 'todo', 'Deep clean the banneton and scrape the tins', '',                                            1, 30, 5);
END$$;
