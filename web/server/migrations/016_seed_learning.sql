-- Seed Stash-Squirrel curated list: Learning.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-learning',
    'Learning',
    'Courses, tutorials, language tools, and reference sites for self-directed study.',
    '📚',
    'system-stash-squirrel',
    'Learning',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'MOOCs',            'bookmark', 'Coursera',            'https://www.coursera.org',           0),
    (v_list_id, 'MOOCs',            'bookmark', 'edX',                 'https://www.edx.org',                1),
    (v_list_id, 'MOOCs',            'bookmark', 'MIT OpenCourseWare',  'https://ocw.mit.edu',                2),
    (v_list_id, 'MOOCs',            'bookmark', 'Khan Academy',        'https://www.khanacademy.org',        3),

    (v_list_id, 'Programming',      'bookmark', 'freeCodeCamp',        'https://www.freecodecamp.org',       0),
    (v_list_id, 'Programming',      'bookmark', 'The Odin Project',    'https://www.theodinproject.com',     1),
    (v_list_id, 'Programming',      'bookmark', 'Codecademy',          'https://www.codecademy.com',         2),
    (v_list_id, 'Programming',      'bookmark', 'Exercism',            'https://exercism.org',               3),
    (v_list_id, 'Programming',      'bookmark', 'LeetCode',            'https://leetcode.com',               4),

    (v_list_id, 'Languages',        'bookmark', 'Duolingo',            'https://www.duolingo.com',           0),
    (v_list_id, 'Languages',        'bookmark', 'Anki',                'https://apps.ankiweb.net',           1),
    (v_list_id, 'Languages',        'bookmark', 'Memrise',             'https://www.memrise.com',            2),
    (v_list_id, 'Languages',        'bookmark', 'LingQ',               'https://www.lingq.com',              3),

    (v_list_id, 'Maths & science',  'bookmark', '3Blue1Brown',         'https://www.3blue1brown.com',        0),
    (v_list_id, 'Maths & science',  'bookmark', 'Brilliant',           'https://brilliant.org',              1),
    (v_list_id, 'Maths & science',  'bookmark', 'Wolfram Alpha',       'https://www.wolframalpha.com',       2),
    (v_list_id, 'Maths & science',  'bookmark', 'Wikipedia',           'https://en.wikipedia.org',           3),

    (v_list_id, 'Books',            'bookmark', 'Goodreads',           'https://www.goodreads.com',          0),
    (v_list_id, 'Books',            'bookmark', 'Project Gutenberg',   'https://www.gutenberg.org',          1),
    (v_list_id, 'Books',            'bookmark', 'LibriVox',            'https://librivox.org',               2),
    (v_list_id, 'Books',            'bookmark', 'Open Library',        'https://openlibrary.org',            3);
END$$;
