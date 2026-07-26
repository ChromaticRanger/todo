-- Seed Stash-Squirrel curated list: Learn Spanish.
-- The routine is language-agnostic — clone it and swap the resources for any
-- other language.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping spanish seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-learn-spanish',
    'Learn Spanish',
    'A daily habit built around comprehensible input and spaced repetition, plus dictionaries, listening practice and tutors.',
    '🇪🇸',
    'Education',
    'system-stash-squirrel',
    'Learn Spanish',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Courses & Drills',  'bookmark', 'Language Transfer',   'https://www.languagetransfer.org',        0),
    (v_list_id, 'Courses & Drills',  'bookmark', 'Duolingo',            'https://www.duolingo.com',                1),
    (v_list_id, 'Courses & Drills',  'bookmark', 'Anki',                'https://apps.ankiweb.net',                2),
    (v_list_id, 'Courses & Drills',  'bookmark', 'Conjuguemos',         'https://conjuguemos.com',                 3),

    (v_list_id, 'Dictionaries',      'bookmark', 'SpanishDict',         'https://www.spanishdict.com',             0),
    (v_list_id, 'Dictionaries',      'bookmark', 'Linguee',             'https://www.linguee.com',                 1),
    (v_list_id, 'Dictionaries',      'bookmark', 'Reverso',             'https://www.reverso.net',                 2),
    (v_list_id, 'Dictionaries',      'bookmark', 'Forvo',               'https://forvo.com',                       3),

    (v_list_id, 'Listening & Input', 'bookmark', 'Dreaming Spanish',    'https://www.dreamingspanish.com',         0),
    (v_list_id, 'Listening & Input', 'bookmark', 'News in Slow Spanish', 'https://www.newsinslowspanish.com',      1),
    (v_list_id, 'Listening & Input', 'bookmark', 'Coffee Break Languages', 'https://coffeebreaklanguages.com',     2),
    (v_list_id, 'Listening & Input', 'bookmark', 'RTVE',                'https://www.rtve.es',                     3),

    (v_list_id, 'Speaking',          'bookmark', 'italki',              'https://www.italki.com',                  0),
    (v_list_id, 'Speaking',          'bookmark', 'Tandem',              'https://tandem.net',                      1),
    (v_list_id, 'Speaking',          'bookmark', 'r/Spanish',           'https://www.reddit.com/r/Spanish/',       2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Daily Habit',    'todo', 'Clear your flashcard reviews',   'Ten minutes. Do this before anything else or it snowballs.', 3, 1, 0),
    (v_list_id, 'Daily Habit',    'todo', 'Twenty minutes of input',        'Listening or reading slightly above your level.',            2, 1, 1),
    (v_list_id, 'Daily Habit',    'todo', 'Add five new cards, no more',    'From things you actually met today, not a frequency list.',  2, 1, 2),
    (v_list_id, 'Daily Habit',    'todo', 'Say three sentences out loud',   'About your day. Badly is fine.',                             1, 1, 3),

    (v_list_id, 'Weekly Habit',   'todo', 'One conversation with a human',  'Tutor or exchange partner. This is the whole point.',        3, 7, 0),
    (v_list_id, 'Weekly Habit',   'todo', 'Watch an episode with Spanish subtitles', 'Spanish audio, Spanish subtitles. Not English.',   2, 7, 1),
    (v_list_id, 'Weekly Habit',   'todo', 'Drill one tense until it is automatic', '',                                                   2, 7, 2),
    (v_list_id, 'Weekly Habit',   'todo', 'Review the week and note what keeps tripping you', '',                                        1, 7, 3);
END$$;
