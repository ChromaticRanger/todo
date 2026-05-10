-- Seed Stash-Squirrel curated list: Music.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-music',
    'Music',
    'Streaming, discovery, reviews, and theory/instrument resources.',
    '🎵',
    'system-stash-squirrel',
    'Music',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Streaming',   'bookmark', 'Spotify',          'https://www.spotify.com',          0),
    (v_list_id, 'Streaming',   'bookmark', 'Apple Music',      'https://music.apple.com',          1),
    (v_list_id, 'Streaming',   'bookmark', 'Tidal',            'https://tidal.com',                2),
    (v_list_id, 'Streaming',   'bookmark', 'YouTube Music',    'https://music.youtube.com',        3),

    (v_list_id, 'Discovery',   'bookmark', 'Bandcamp',         'https://bandcamp.com',             0),
    (v_list_id, 'Discovery',   'bookmark', 'SoundCloud',       'https://soundcloud.com',           1),
    (v_list_id, 'Discovery',   'bookmark', 'NTS Radio',        'https://www.nts.live',             2),
    (v_list_id, 'Discovery',   'bookmark', 'Hype Machine',     'https://hypem.com',                3),

    (v_list_id, 'Reviews',     'bookmark', 'Pitchfork',        'https://pitchfork.com',            0),
    (v_list_id, 'Reviews',     'bookmark', 'AllMusic',         'https://www.allmusic.com',         1),
    (v_list_id, 'Reviews',     'bookmark', 'Album of the Year','https://www.albumoftheyear.org',   2),
    (v_list_id, 'Reviews',     'bookmark', 'Rate Your Music',  'https://rateyourmusic.com',        3),

    (v_list_id, 'Theory & instruments', 'bookmark', 'musictheory.net',  'https://www.musictheory.net',  0),
    (v_list_id, 'Theory & instruments', 'bookmark', 'Ultimate Guitar',  'https://www.ultimate-guitar.com',1),
    (v_list_id, 'Theory & instruments', 'bookmark', 'Hooktheory',       'https://www.hooktheory.com',   2),
    (v_list_id, 'Theory & instruments', 'bookmark', 'Soundslice',       'https://www.soundslice.com',   3);
END$$;
