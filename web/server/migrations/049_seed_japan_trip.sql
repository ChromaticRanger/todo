-- Seed Stash-Squirrel curated list: Japan Trip Planning.
--
-- The countdown sections are one-off todos (no repeat) — cloning gives you a
-- checklist, not a recurring chore. Named "Step N ·" so the alphabetical
-- section ordering puts them in chronological order.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping japan seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-japan-trip',
    'Japan Trip Planning',
    'A countdown from three months out to the day before, plus the transit tools, booking sites and guides that actually help.',
    '🗾',
    'Travel',
    'system-stash-squirrel',
    'Japan Trip Planning',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Book & Stay',      'bookmark', 'Agoda',                'https://www.agoda.com',                          0),
    (v_list_id, 'Book & Stay',      'bookmark', 'Japan Rail Pass',      'https://japanrailpass.net',                      1),
    (v_list_id, 'Book & Stay',      'bookmark', 'Visit Japan Web',      'https://services.digital.go.jp/en/visit-japan-web/', 2),

    (v_list_id, 'Getting Around',   'bookmark', 'Jorudan Route Search', 'https://world.jorudan.co.jp/mln/en/',            0),
    (v_list_id, 'Getting Around',   'bookmark', 'Tokyo Metro',          'https://www.tokyometro.jp/en/',                  1),
    (v_list_id, 'Getting Around',   'bookmark', 'Japan Meteorological Agency', 'https://www.jma.go.jp/jma/indexe.html',   2),

    (v_list_id, 'Read Before You Go', 'bookmark', 'Japan Guide',        'https://www.japan-guide.com',                    0),
    (v_list_id, 'Read Before You Go', 'bookmark', 'JNTO Official',      'https://www.japan.travel/en/uk/',                1),
    (v_list_id, 'Read Before You Go', 'bookmark', 'Tokyo Cheapo',       'https://tokyocheapo.com',                        2),
    (v_list_id, 'Read Before You Go', 'bookmark', 'GaijinPot Blog',     'https://blog.gaijinpot.com',                     3),
    (v_list_id, 'Read Before You Go', 'bookmark', 'r/JapanTravel',      'https://www.reddit.com/r/JapanTravel/',          4);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, sort_order) VALUES
    (v_list_id, 'Step 1 · Three Months Out', 'todo', 'Check your passport has six months left', 'The single most common trip-killer.',              3, 0),
    (v_list_id, 'Step 1 · Three Months Out', 'todo', 'Check visa requirements for your nationality', 'Many countries get visa-free short stays — confirm yours.', 3, 1),
    (v_list_id, 'Step 1 · Three Months Out', 'todo', 'Book flights',                    'Shoulder seasons are cheaper and far less crowded.',      3, 2),
    (v_list_id, 'Step 1 · Three Months Out', 'todo', 'Sketch a rough route and pace it', 'Two or three bases beats seven one-night hotels.',        2, 3),
    (v_list_id, 'Step 1 · Three Months Out', 'todo', 'Book accommodation for the busy stops', 'Kyoto in autumn sells out months ahead.',            2, 4),

    (v_list_id, 'Step 2 · One Month Out',    'todo', 'Decide on a rail pass',           'Only worth it for long-distance travel — do the maths.',  2, 0),
    (v_list_id, 'Step 2 · One Month Out',    'todo', 'Buy travel insurance',            'Medical cover is the part that matters.',                 3, 1),
    (v_list_id, 'Step 2 · One Month Out',    'todo', 'Book anything that needs reserving', 'Popular museums, teamLab, Ghibli, sumo, kaiseki.',      2, 2),
    (v_list_id, 'Step 2 · One Month Out',    'todo', 'Sort data: eSIM or pocket wifi',  'Book the wifi router for airport pickup if you go that way.', 2, 3),
    (v_list_id, 'Step 2 · One Month Out',    'todo', 'Tell your bank you are travelling', '',                                                      1, 4),

    (v_list_id, 'Step 3 · One Week Out',     'todo', 'Complete Visit Japan Web',        'Immigration and customs pre-registration. Saves real queueing.', 3, 0),
    (v_list_id, 'Step 3 · One Week Out',     'todo', 'Get some yen',                    'Cash is still king in small restaurants and shrines.',    2, 1),
    (v_list_id, 'Step 3 · One Week Out',     'todo', 'Download offline maps and a translation app', '',                                            2, 2),
    (v_list_id, 'Step 3 · One Week Out',     'todo', 'Check the forecast and pack for it', 'Summer is brutally humid; winter varies hugely by region.', 1, 3),
    (v_list_id, 'Step 3 · One Week Out',     'todo', 'Photograph your passport and insurance', 'Store the copies somewhere you can reach offline.', 2, 4),

    (v_list_id, 'Step 4 · The Day Before',   'todo', 'Check in online and save the boarding pass', '',                                             2, 0),
    (v_list_id, 'Step 4 · The Day Before',   'todo', 'Charge everything and pack a power bank', 'Japan uses Type A plugs at 100V.',                 2, 1),
    (v_list_id, 'Step 4 · The Day Before',   'todo', 'Pack light — you will be carrying it up station stairs', 'Lifts are not a given.',            2, 2),
    (v_list_id, 'Step 4 · The Day Before',   'todo', 'Confirm the first night''s address in Japanese', 'Screenshot it for the taxi driver.',        1, 3);
END$$;
