-- Seed Stash-Squirrel curated list: News.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-news',
    'News',
    'Reputable outlets across world, tech, business, and science reporting.',
    '📰',
    'system-stash-squirrel',
    'News',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'World',     'bookmark', 'BBC News',           'https://www.bbc.com/news',                       0),
    (v_list_id, 'World',     'bookmark', 'Reuters',            'https://www.reuters.com',                        1),
    (v_list_id, 'World',     'bookmark', 'Associated Press',   'https://apnews.com',                             2),
    (v_list_id, 'World',     'bookmark', 'The Guardian',       'https://www.theguardian.com/international',      3),
    (v_list_id, 'World',     'bookmark', 'Al Jazeera',         'https://www.aljazeera.com',                      4),

    (v_list_id, 'Tech',      'bookmark', 'Hacker News',        'https://news.ycombinator.com',                   0),
    (v_list_id, 'Tech',      'bookmark', 'Ars Technica',       'https://arstechnica.com',                        1),
    (v_list_id, 'Tech',      'bookmark', 'The Verge',          'https://www.theverge.com',                       2),
    (v_list_id, 'Tech',      'bookmark', 'TechCrunch',         'https://techcrunch.com',                         3),
    (v_list_id, 'Tech',      'bookmark', 'Wired',              'https://www.wired.com',                          4),

    (v_list_id, 'Business',  'bookmark', 'Financial Times',    'https://www.ft.com',                             0),
    (v_list_id, 'Business',  'bookmark', 'The Economist',      'https://www.economist.com',                      1),
    (v_list_id, 'Business',  'bookmark', 'Bloomberg',          'https://www.bloomberg.com',                      2),
    (v_list_id, 'Business',  'bookmark', 'WSJ',                'https://www.wsj.com',                            3),

    (v_list_id, 'Science',   'bookmark', 'Nature',             'https://www.nature.com',                         0),
    (v_list_id, 'Science',   'bookmark', 'Quanta Magazine',    'https://www.quantamagazine.org',                 1),
    (v_list_id, 'Science',   'bookmark', 'Scientific American','https://www.scientificamerican.com',             2),
    (v_list_id, 'Science',   'bookmark', 'New Scientist',      'https://www.newscientist.com',                   3),

    (v_list_id, 'Long-form', 'bookmark', 'The New Yorker',     'https://www.newyorker.com',                      0),
    (v_list_id, 'Long-form', 'bookmark', 'The Atlantic',       'https://www.theatlantic.com',                    1),
    (v_list_id, 'Long-form', 'bookmark', 'Longreads',          'https://longreads.com',                          2),
    (v_list_id, 'Long-form', 'bookmark', 'Aeon',               'https://aeon.co',                                3);
END$$;
