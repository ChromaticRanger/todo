-- Seed Stash-Squirrel curated list: Meal Prep Sunday.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping meal-prep seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-meal-prep',
    'Meal Prep Sunday',
    'A repeating Sunday routine that turns two hours into a week of meals, plus the recipe sites worth cooking from.',
    '🥘',
    'Food & Drink',
    'system-stash-squirrel',
    'Meal Prep Sunday',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Community',        'bookmark', 'r/MealPrepSunday',     'https://www.reddit.com/r/MealPrepSunday/',    0),
    (v_list_id, 'Community',        'bookmark', 'r/EatCheapAndHealthy', 'https://www.reddit.com/r/EatCheapAndHealthy/', 1),

    (v_list_id, 'Planning Tools',   'bookmark', 'Mealime',              'https://www.mealime.com',                     0),
    (v_list_id, 'Planning Tools',   'bookmark', 'Paprika Recipe Manager', 'https://www.paprikaapp.com',                1),
    (v_list_id, 'Planning Tools',   'bookmark', 'Love Food Hate Waste', 'https://www.lovefoodhatewaste.com',           2),
    (v_list_id, 'Planning Tools',   'bookmark', 'NHS Eatwell Guide',    'https://www.nhs.uk/live-well/eat-well/',      3),

    (v_list_id, 'Recipes',          'bookmark', 'BBC Good Food',        'https://www.bbcgoodfood.com',                 0),
    (v_list_id, 'Recipes',          'bookmark', 'Budget Bytes',         'https://www.budgetbytes.com',                 1),
    (v_list_id, 'Recipes',          'bookmark', 'Pinch of Yum',         'https://pinchofyum.com',                      2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Sunday Routine', 'todo', 'Pick three meals for the week',   'Two you know, one you have not made before.',            2, 7,  0),
    (v_list_id, 'Sunday Routine', 'todo', 'Shop the fridge and freezer first', 'Plan around what needs using up.',                     2, 7,  1),
    (v_list_id, 'Sunday Routine', 'todo', 'Write the shopping list by aisle', 'Halves the time in the shop.',                          1, 7,  2),
    (v_list_id, 'Sunday Routine', 'todo', 'Do the shop',                     '',                                                      2, 7,  3),
    (v_list_id, 'Sunday Routine', 'todo', 'Cook a batch of grains and a protein', 'Rice or pasta plus chicken, beans or tofu.',        2, 7,  4),
    (v_list_id, 'Sunday Routine', 'todo', 'Roast a tray of vegetables',      'Whatever is cheap. Roasts while you do everything else.', 2, 7,  5),
    (v_list_id, 'Sunday Routine', 'todo', 'Make one sauce or dressing',      'This is what stops the week tasting identical.',         1, 7,  6),
    (v_list_id, 'Sunday Routine', 'todo', 'Portion into containers and label', 'Date them. Front of fridge, eat oldest first.',        2, 7,  7),
    (v_list_id, 'Sunday Routine', 'todo', 'Prep grab-and-go breakfasts',     'Overnight oats or egg muffins.',                         1, 7,  8),
    (v_list_id, 'Sunday Routine', 'todo', 'Clear out the fridge before restocking', 'Five minutes now, no science experiments later.', 1, 7,  9);
END$$;
