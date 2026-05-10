-- Seed Stash-Squirrel curated list: Design & UX.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-design-ux',
    'Design & UX',
    'Inspiration galleries, colour tools, type, icons, and stock imagery for designers.',
    '🎨',
    'system-stash-squirrel',
    'Design & UX',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Inspiration', 'bookmark', 'Dribbble',           'https://dribbble.com',            0),
    (v_list_id, 'Inspiration', 'bookmark', 'Behance',            'https://www.behance.net',         1),
    (v_list_id, 'Inspiration', 'bookmark', 'Awwwards',           'https://www.awwwards.com',        2),
    (v_list_id, 'Inspiration', 'bookmark', 'Mobbin',             'https://mobbin.com',              3),
    (v_list_id, 'Inspiration', 'bookmark', 'Land-book',          'https://land-book.com',           4),

    (v_list_id, 'Colour',      'bookmark', 'Coolors',            'https://coolors.co',              0),
    (v_list_id, 'Colour',      'bookmark', 'Adobe Color',        'https://color.adobe.com',         1),
    (v_list_id, 'Colour',      'bookmark', 'Realtime Colors',    'https://www.realtimecolors.com',  2),
    (v_list_id, 'Colour',      'bookmark', 'OKLCH Picker',       'https://oklch.com',               3),

    (v_list_id, 'Typography',  'bookmark', 'Google Fonts',       'https://fonts.google.com',        0),
    (v_list_id, 'Typography',  'bookmark', 'Fontshare',          'https://www.fontshare.com',       1),
    (v_list_id, 'Typography',  'bookmark', 'Type Scale',         'https://typescale.com',           2),
    (v_list_id, 'Typography',  'bookmark', 'Fonts in Use',       'https://fontsinuse.com',          3),

    (v_list_id, 'Icons',       'bookmark', 'Heroicons',          'https://heroicons.com',           0),
    (v_list_id, 'Icons',       'bookmark', 'Lucide',             'https://lucide.dev',              1),
    (v_list_id, 'Icons',       'bookmark', 'Phosphor Icons',     'https://phosphoricons.com',       2),
    (v_list_id, 'Icons',       'bookmark', 'The Noun Project',   'https://thenounproject.com',      3),

    (v_list_id, 'Stock images','bookmark', 'Unsplash',           'https://unsplash.com',            0),
    (v_list_id, 'Stock images','bookmark', 'Pexels',             'https://www.pexels.com',          1),
    (v_list_id, 'Stock images','bookmark', 'Pixabay',            'https://pixabay.com',             2),
    (v_list_id, 'Stock images','bookmark', 'Open Peeps',         'https://www.openpeeps.com',       3),

    (v_list_id, 'Tools',       'bookmark', 'Figma',              'https://www.figma.com',           0),
    (v_list_id, 'Tools',       'bookmark', 'Excalidraw',         'https://excalidraw.com',          1),
    (v_list_id, 'Tools',       'bookmark', 'tldraw',             'https://www.tldraw.com',          2),
    (v_list_id, 'Tools',       'bookmark', 'Whimsical',          'https://whimsical.com',           3);
END$$;
