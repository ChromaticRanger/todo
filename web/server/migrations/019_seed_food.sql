-- Seed Stash-Squirrel curated list: Food & Cooking.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-food',
    'Food & Cooking',
    'Recipes, technique deep-dives, restaurant guides, and drinks references.',
    '🍳',
    'system-stash-squirrel',
    'Food & Cooking',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Recipes',         'bookmark', 'BBC Good Food',         'https://www.bbcgoodfood.com',                 0),
    (v_list_id, 'Recipes',         'bookmark', 'Serious Eats',          'https://www.seriouseats.com',                 1),
    (v_list_id, 'Recipes',         'bookmark', 'NYT Cooking',           'https://cooking.nytimes.com',                 2),
    (v_list_id, 'Recipes',         'bookmark', 'Bon Appétit',           'https://www.bonappetit.com',                  3),
    (v_list_id, 'Recipes',         'bookmark', 'Allrecipes',            'https://www.allrecipes.com',                  4),

    (v_list_id, 'Food writing',    'bookmark', 'Eater',                 'https://www.eater.com',                       0),
    (v_list_id, 'Food writing',    'bookmark', 'Smitten Kitchen',       'https://smittenkitchen.com',                  1),
    (v_list_id, 'Food writing',    'bookmark', 'Food52',                'https://food52.com',                          2),
    (v_list_id, 'Food writing',    'bookmark', 'The Kitchn',            'https://www.thekitchn.com',                   3),

    (v_list_id, 'Baking',          'bookmark', 'King Arthur Baking',    'https://www.kingarthurbaking.com',            0),
    (v_list_id, 'Baking',          'bookmark', 'The Perfect Loaf',      'https://www.theperfectloaf.com',              1),
    (v_list_id, 'Baking',          'bookmark', 'Half Baked Harvest',    'https://www.halfbakedharvest.com',            2),
    (v_list_id, 'Baking',          'bookmark', 'Sally''s Baking Addiction','https://sallysbakingaddiction.com',         3),

    (v_list_id, 'Technique',       'bookmark', 'Serious Eats Techniques','https://www.seriouseats.com/cooking-techniques-5117697', 0),
    (v_list_id, 'Technique',       'bookmark', 'ChefSteps',             'https://www.chefsteps.com',                   1),
    (v_list_id, 'Technique',       'bookmark', 'J. Kenji López-Alt',    'https://www.youtube.com/@JKenjiLopezAlt',     2),
    (v_list_id, 'Technique',       'bookmark', 'Adam Ragusea',          'https://www.youtube.com/@aragusea',           3),

    (v_list_id, 'Restaurants',     'bookmark', 'OpenTable',             'https://www.opentable.com',                   0),
    (v_list_id, 'Restaurants',     'bookmark', 'Resy',                  'https://resy.com',                            1),
    (v_list_id, 'Restaurants',     'bookmark', 'The MICHELIN Guide',    'https://guide.michelin.com',                  2),
    (v_list_id, 'Restaurants',     'bookmark', 'World''s 50 Best Restaurants','https://www.theworlds50best.com',        3),

    (v_list_id, 'Drinks',          'bookmark', 'James Hoffmann',        'https://www.youtube.com/@jameshoffmann',      0),
    (v_list_id, 'Drinks',          'bookmark', 'Difford''s Guide',      'https://www.diffordsguide.com',               1),
    (v_list_id, 'Drinks',          'bookmark', 'Punch',                 'https://punchdrink.com',                      2),
    (v_list_id, 'Drinks',          'bookmark', 'Decanter',              'https://www.decanter.com',                    3);
END$$;
