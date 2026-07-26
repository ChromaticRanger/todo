-- Seed Stash-Squirrel curated list: Podcasts Worth Your Time.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping podcasts seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-podcasts',
    'Podcasts Worth Your Time',
    'A shortlist of shows that reliably repay the hour, sorted by what you are in the mood for — plus decent players to hear them in.',
    '🎧',
    'Entertainment',
    'system-stash-squirrel',
    'Podcasts Worth Your Time',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, description, url, sort_order) VALUES
    (v_list_id, 'History & Ideas',  'bookmark', 'In Our Time',          'Melvyn Bragg and three academics on one topic. Forty-five minutes, no filler.', 'https://www.bbc.co.uk/programmes/b006qykl',        0),
    (v_list_id, 'History & Ideas',  'bookmark', 'The Rest Is History',  'Two historians, genuinely funny, surprisingly rigorous.',                       'https://therestishistory.com',                     1),
    (v_list_id, 'History & Ideas',  'bookmark', 'Hardcore History',     'Four-hour episodes, twice a year. Worth the wait.',                             'https://www.dancarlin.com/hardcore-history-series/', 2),

    (v_list_id, 'Storytelling',     'bookmark', 'This American Life',   'The show that defined the format.',                                             'https://www.thisamericanlife.org',                 0),
    (v_list_id, 'Storytelling',     'bookmark', 'Radiolab',             'Science and sound design, tightly produced.',                                   'https://radiolab.org',                             1),
    (v_list_id, 'Storytelling',     'bookmark', 'Search Engine',        'One question per episode, chased properly.',                                    'https://www.searchengine.show',                    2),
    (v_list_id, 'Storytelling',     'bookmark', '99% Invisible',        'Design and the built world. Consistently excellent.',                           'https://99percentinvisible.org',                   3),
    (v_list_id, 'Storytelling',     'bookmark', 'Darknet Diaries',      'True stories from hacking and cybercrime.',                                     'https://darknetdiaries.com',                       4);

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Find More',        'bookmark', 'BBC Sounds',           'https://www.bbc.co.uk/sounds',           0),
    (v_list_id, 'Find More',        'bookmark', 'Podchaser',            'https://www.podchaser.com',              1),
    (v_list_id, 'Find More',        'bookmark', 'r/podcasts',           'https://www.reddit.com/r/podcasts/',     2),

    (v_list_id, 'Players',          'bookmark', 'Overcast',             'https://overcast.fm',                    0),
    (v_list_id, 'Players',          'bookmark', 'Pocket Casts',         'https://pocketcasts.com',                1),
    (v_list_id, 'Players',          'bookmark', 'AntennaPod',           'https://antennapod.org',                 2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Listening Habits', 'todo', 'Prune the queue',              'Unsubscribe from anything you skip twice running.',        1, 30, 0),
    (v_list_id, 'Listening Habits', 'todo', 'Try one show outside your usual', '',                                                      1, 30, 1),
    (v_list_id, 'Listening Habits', 'todo', 'Save any episode worth recommending', 'A list of three good ones beats a backlog of ninety.', 1, 30, 2);
END$$;
