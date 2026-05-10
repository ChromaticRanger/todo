-- Seed Stash-Squirrel curated list: Movies & TV.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-movies-tv',
    'Movies & TV',
    'Reviews, databases, streaming guides, and trailers for film and television.',
    '🎬',
    'system-stash-squirrel',
    'Movies & TV',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Reviews',          'bookmark', 'Rotten Tomatoes',     'https://www.rottentomatoes.com',     0),
    (v_list_id, 'Reviews',          'bookmark', 'Metacritic',          'https://www.metacritic.com',         1),
    (v_list_id, 'Reviews',          'bookmark', 'Letterboxd',          'https://letterboxd.com',             2),
    (v_list_id, 'Reviews',          'bookmark', 'Roger Ebert',         'https://www.rogerebert.com',         3),

    (v_list_id, 'Databases',        'bookmark', 'IMDb',                'https://www.imdb.com',               0),
    (v_list_id, 'Databases',        'bookmark', 'TMDB',                'https://www.themoviedb.org',         1),
    (v_list_id, 'Databases',        'bookmark', 'TV Tropes',           'https://tvtropes.org',               2),
    (v_list_id, 'Databases',        'bookmark', 'Trakt',               'https://trakt.tv',                   3),

    (v_list_id, 'Streaming guides', 'bookmark', 'JustWatch',           'https://www.justwatch.com',          0),
    (v_list_id, 'Streaming guides', 'bookmark', 'Reelgood',            'https://reelgood.com',               1),
    (v_list_id, 'Streaming guides', 'bookmark', 'What''s on Netflix',  'https://www.whats-on-netflix.com',   2),
    (v_list_id, 'Streaming guides', 'bookmark', 'TV Time',             'https://www.tvtime.com',             3),

    (v_list_id, 'Trailers & news',  'bookmark', 'YouTube Movies',      'https://www.youtube.com/movies',     0),
    (v_list_id, 'Trailers & news',  'bookmark', 'IGN',                 'https://www.ign.com',                1),
    (v_list_id, 'Trailers & news',  'bookmark', 'Variety',             'https://variety.com',                2),
    (v_list_id, 'Trailers & news',  'bookmark', 'The Hollywood Reporter','https://www.hollywoodreporter.com',3);
END$$;
