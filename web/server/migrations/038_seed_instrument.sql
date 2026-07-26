-- Seed Stash-Squirrel curated list: Learn an Instrument.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping instrument seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-learn-instrument',
    'Learn an Instrument',
    'A daily practice routine that actually builds skill, plus tab sites, theory drills and ear training. Works for guitar or piano.',
    '🎸',
    'Hobbies & Crafts',
    'system-stash-squirrel',
    'Learn an Instrument',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Community',         'bookmark', 'r/guitar',           'https://www.reddit.com/r/guitar/',       0),
    (v_list_id, 'Community',         'bookmark', 'r/piano',            'https://www.reddit.com/r/piano/',        1),
    (v_list_id, 'Community',         'bookmark', 'r/musictheory',      'https://www.reddit.com/r/musictheory/',  2),

    (v_list_id, 'Ear & Theory',      'bookmark', 'musictheory.net',    'https://www.musictheory.net',            0),
    (v_list_id, 'Ear & Theory',      'bookmark', 'Teoria',             'https://www.teoria.com',                 1),
    (v_list_id, 'Ear & Theory',      'bookmark', 'Toned Ear',          'https://tonedear.com',                   2),
    (v_list_id, 'Ear & Theory',      'bookmark', 'Hooktheory',         'https://www.hooktheory.com',             3),
    (v_list_id, 'Ear & Theory',      'bookmark', 'Metronome Online',   'https://www.metronomeonline.com',        4),

    (v_list_id, 'Lessons',           'bookmark', 'JustinGuitar',       'https://www.justinguitar.com',           0),
    (v_list_id, 'Lessons',           'bookmark', 'flowkey',            'https://www.flowkey.com',                1),
    (v_list_id, 'Lessons',           'bookmark', 'Simply Piano',       'https://www.hellosimply.com',            2),

    (v_list_id, 'Tabs & Sheet Music','bookmark', 'Ultimate Guitar',    'https://www.ultimate-guitar.com',        0),
    (v_list_id, 'Tabs & Sheet Music','bookmark', 'Songsterr',          'https://www.songsterr.com',              1),
    (v_list_id, 'Tabs & Sheet Music','bookmark', 'MuseScore',          'https://musescore.com',                  2),
    (v_list_id, 'Tabs & Sheet Music','bookmark', 'Soundslice',         'https://www.soundslice.com',             3);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Practice Routine', 'todo', 'Warm up for five minutes',          'Scales or simple exercises. Never skip straight to songs.',   2, 1,  0),
    (v_list_id, 'Practice Routine', 'todo', 'Ten minutes on one technique',      'The thing you are worst at, not the thing you enjoy.',        2, 1,  1),
    (v_list_id, 'Practice Routine', 'todo', 'Learn or refine eight bars',        'Small chunks, played slowly and correctly, beat whole songs.', 2, 1,  2),
    (v_list_id, 'Practice Routine', 'todo', 'Five minutes of ear training',      'Intervals and chord quality.',                                1, 1,  3),
    (v_list_id, 'Practice Routine', 'todo', 'Play with a metronome, slower than feels right', 'Speed is a by-product of accuracy.',              2, 1,  4),

    (v_list_id, 'Weekly & Monthly', 'todo', 'Record yourself playing',           'Painful, and the fastest feedback you will get.',             2, 7,  0),
    (v_list_id, 'Weekly & Monthly', 'todo', 'Learn one new chord, scale or voicing', '',                                                        1, 7,  1),
    (v_list_id, 'Weekly & Monthly', 'todo', 'Play along with a real recording',  'Timing under pressure is a separate skill.',                  1, 7,  2),
    (v_list_id, 'Weekly & Monthly', 'todo', 'Change strings or tune properly',   '',                                                            1, 30, 3),
    (v_list_id, 'Weekly & Monthly', 'todo', 'Play a piece for another person',   'The reason you are doing any of this.',                       1, 30, 4);
END$$;
