-- Seed Stash-Squirrel curated list: Cocktails at Home.
-- The "Starter Bar" todos are a shopping list: one-off items, no repeat.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping cocktails seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-cocktails',
    'Cocktails at Home',
    'The eight bottles that cover most classic cocktails, plus recipe references and the channels that teach technique.',
    '🍸',
    'Food & Drink',
    'system-stash-squirrel',
    'Cocktails at Home',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Buy Bottles',      'bookmark', 'Master of Malt',       'https://www.masterofmalt.com',        0),
    (v_list_id, 'Buy Bottles',      'bookmark', 'The Whisky Exchange',  'https://www.thewhiskyexchange.com',   1),

    (v_list_id, 'Community',        'bookmark', 'r/cocktails',          'https://www.reddit.com/r/cocktails/', 0),

    (v_list_id, 'Recipes',          'bookmark', 'Difford''s Guide',     'https://www.diffordsguide.com',       0),
    (v_list_id, 'Recipes',          'bookmark', 'Kindred Cocktails',    'https://kindredcocktails.com',        1),
    (v_list_id, 'Recipes',          'bookmark', 'Punch',                'https://punchdrink.com',              2),
    (v_list_id, 'Recipes',          'bookmark', 'Liquor.com',           'https://www.liquor.com',              3),

    (v_list_id, 'Watch & Learn',    'bookmark', 'The Educated Barfly',  'https://www.youtube.com/@TheEducatedBarfly',   0),
    (v_list_id, 'Watch & Learn',    'bookmark', 'Steve the Bartender',  'https://www.youtube.com/@SteveTheBartender_',  1),
    (v_list_id, 'Watch & Learn',    'bookmark', 'Anders Erickson',      'https://www.youtube.com/@AndersErickson',      2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, sort_order) VALUES
    (v_list_id, 'Starter Bar',   'todo', 'London dry gin',              'Negroni, martini, gimlet, tom collins.',              2, 0),
    (v_list_id, 'Starter Bar',   'todo', 'Bourbon or rye whiskey',      'Old fashioned, manhattan, whiskey sour.',             2, 1),
    (v_list_id, 'Starter Bar',   'todo', 'White rum',                   'Daiquiri, mojito.',                                   2, 2),
    (v_list_id, 'Starter Bar',   'todo', 'Sweet vermouth',              'Keep it in the fridge — it is wine, and it dies.',     2, 3),
    (v_list_id, 'Starter Bar',   'todo', 'Dry vermouth',                'Same rule. Buy small bottles.',                        1, 4),
    (v_list_id, 'Starter Bar',   'todo', 'Campari',                     'Negroni, boulevardier, americano.',                    1, 5),
    (v_list_id, 'Starter Bar',   'todo', 'Orange and Angostura bitters', 'Lasts years. Transforms everything.',                 2, 6),
    (v_list_id, 'Starter Bar',   'todo', 'Triple sec or Cointreau',     'Margarita, sidecar, cosmopolitan.',                    1, 7),
    (v_list_id, 'Starter Bar',   'todo', 'Jigger, shaker, strainer, bar spoon', 'Skip the novelty kits — buy these four singly.', 2, 8),
    (v_list_id, 'Starter Bar',   'todo', 'Make simple syrup',           'Equal parts sugar and hot water. Keeps a month in the fridge.', 2, 9);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Weekly Practice', 'todo', 'Make one classic properly',  'Measure everything. Taste it. Write down what you would change.', 1, 7, 0),
    (v_list_id, 'Weekly Practice', 'todo', 'Buy fresh citrus',           'Bottled juice is the single biggest downgrade you can make.',     2, 7, 1);
END$$;
