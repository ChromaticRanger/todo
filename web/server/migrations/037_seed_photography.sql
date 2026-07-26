-- Seed Stash-Squirrel curated list: Photography Basics.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping photography seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-photography-basics',
    'Photography Basics',
    'Learn the exposure triangle, then a weekly shooting assignment to actually practise it. Free editing tools included.',
    '📷',
    'Hobbies & Crafts',
    'system-stash-squirrel',
    'Photography Basics',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Community & Gear', 'bookmark', 'r/photography',        'https://www.reddit.com/r/photography/', 0),
    (v_list_id, 'Community & Gear', 'bookmark', 'Flickr',               'https://www.flickr.com',                1),
    (v_list_id, 'Community & Gear', 'bookmark', 'DPReview',             'https://www.dpreview.com',              2),
    (v_list_id, 'Community & Gear', 'bookmark', 'PetaPixel',            'https://petapixel.com',                 3),

    (v_list_id, 'Editing',          'bookmark', 'darktable',            'https://www.darktable.org',             0),
    (v_list_id, 'Editing',          'bookmark', 'RawTherapee',          'https://www.rawtherapee.com',           1),
    (v_list_id, 'Editing',          'bookmark', 'GIMP',                 'https://www.gimp.org',                  2),

    (v_list_id, 'Learn the Basics', 'bookmark', 'Digital Photography School', 'https://digital-photography-school.com',            0),
    (v_list_id, 'Learn the Basics', 'bookmark', 'Cambridge in Colour Tutorials', 'https://www.cambridgeincolour.com/tutorials.htm', 1),
    (v_list_id, 'Learn the Basics', 'bookmark', 'Photography Life',     'https://photographylife.com',           2),

    (v_list_id, 'Watch & Learn',    'bookmark', 'Sean Tucker',          'https://www.youtube.com/@seantuck',           0),
    (v_list_id, 'Watch & Learn',    'bookmark', 'Thomas Heaton',        'https://www.youtube.com/@ThomasHeatonPhoto',  1);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Weekly Assignment', 'todo', 'Shoot a whole week in manual mode',  'Aperture, shutter, ISO. No auto, no excuses.',           2, 7, 0),
    (v_list_id, 'Weekly Assignment', 'todo', 'One subject, thirty frames',         'Force yourself past the obvious first shot.',            2, 7, 1),
    (v_list_id, 'Weekly Assignment', 'todo', 'Shoot at golden hour',               'Same scene at noon and at dusk — compare them.',         1, 7, 2),
    (v_list_id, 'Weekly Assignment', 'todo', 'Practise one composition rule',      'Thirds, leading lines, framing, negative space. Rotate.', 1, 7, 3),
    (v_list_id, 'Weekly Assignment', 'todo', 'Edit three shots start to finish',   'Raw to export. Learn the tools on your own images.',     2, 7, 4),
    (v_list_id, 'Weekly Assignment', 'todo', 'Pick your best shot and say why',    'The why is the part that makes you better.',             1, 7, 5),
    (v_list_id, 'Weekly Assignment', 'todo', 'Back up the month''s photos',        'Two copies, one off-site.',                              3, 30, 6);
END$$;
