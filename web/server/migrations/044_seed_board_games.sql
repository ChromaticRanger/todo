-- Seed Stash-Squirrel curated list: Board Games.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping board-games seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-board-games',
    'Board Games',
    'Where to find out what is good, where to play online for free, and where to buy it once you are convinced.',
    '🎲',
    'Entertainment',
    'system-stash-squirrel',
    'Board Games',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Buy & Events',   'bookmark', 'Zatu Games',           'https://www.board-game.co.uk',           0),
    (v_list_id, 'Buy & Events',   'bookmark', 'Chaos Cards',          'https://www.chaoscards.co.uk',           1),
    (v_list_id, 'Buy & Events',   'bookmark', 'UK Games Expo',        'https://www.ukgamesexpo.co.uk',          2),

    (v_list_id, 'Community',      'bookmark', 'r/boardgames',         'https://www.reddit.com/r/boardgames/',   0),

    (v_list_id, 'Play Online',    'bookmark', 'Board Game Arena',     'https://boardgamearena.com',             0),
    (v_list_id, 'Play Online',    'bookmark', 'Yucata',               'https://www.yucata.de',                  1),
    (v_list_id, 'Play Online',    'bookmark', 'Tabletopia',           'https://tabletopia.com',                 2),

    (v_list_id, 'Reviews & Rankings', 'bookmark', 'BoardGameGeek',    'https://boardgamegeek.com',              0),
    (v_list_id, 'Reviews & Rankings', 'bookmark', 'Shut Up & Sit Down', 'https://www.shutupandsitdown.com',     1),
    (v_list_id, 'Reviews & Rankings', 'bookmark', 'No Pun Included',  'https://www.youtube.com/@NoPunIncluded', 2),
    (v_list_id, 'Reviews & Rankings', 'bookmark', 'The Dice Tower',   'https://www.dicetower.com',              3);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Game Night', 'todo', 'Pick and pitch a game to the group',  'Learn the rules properly beforehand — nothing kills a night faster.', 2, 14, 0),
    (v_list_id, 'Game Night', 'todo', 'Teach the rules in under ten minutes', 'Goal of the game, how a turn works, how it ends. Details as they come up.', 2, 14, 1),
    (v_list_id, 'Game Night', 'todo', 'Play something outside your comfort zone', 'Co-op, deduction, dexterity, heavy euro. Rotate.',                1, 30, 2),
    (v_list_id, 'Game Night', 'todo', 'Log what you played and what landed', 'Saves picking the same wrong game twice.',                            1, 30, 3),
    (v_list_id, 'Game Night', 'todo', 'Cull the shelf',                      'If it has not hit the table in a year, someone else will love it.',   1, 0,  4);
END$$;
