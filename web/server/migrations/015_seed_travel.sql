-- Seed Stash-Squirrel curated list: Travel.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-travel',
    'Travel',
    'Booking sites, reviews, maps, and trip-planning tools for getting around.',
    '✈️',
    'system-stash-squirrel',
    'Travel',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Flights',        'bookmark', 'Google Flights',     'https://www.google.com/travel/flights', 0),
    (v_list_id, 'Flights',        'bookmark', 'Skyscanner',         'https://www.skyscanner.net',            1),
    (v_list_id, 'Flights',        'bookmark', 'Kayak',              'https://www.kayak.com',                 2),
    (v_list_id, 'Flights',        'bookmark', 'Kiwi.com',           'https://www.kiwi.com',                  3),

    (v_list_id, 'Stays',          'bookmark', 'Booking.com',        'https://www.booking.com',               0),
    (v_list_id, 'Stays',          'bookmark', 'Airbnb',             'https://www.airbnb.com',                1),
    (v_list_id, 'Stays',          'bookmark', 'Hostelworld',        'https://www.hostelworld.com',           2),
    (v_list_id, 'Stays',          'bookmark', 'Agoda',              'https://www.agoda.com',                 3),

    (v_list_id, 'Reviews',        'bookmark', 'TripAdvisor',        'https://www.tripadvisor.com',           0),
    (v_list_id, 'Reviews',        'bookmark', 'Lonely Planet',      'https://www.lonelyplanet.com',          1),
    (v_list_id, 'Reviews',        'bookmark', 'r/travel',           'https://www.reddit.com/r/travel/',      2),
    (v_list_id, 'Reviews',        'bookmark', 'Atlas Obscura',      'https://www.atlasobscura.com',          3),

    (v_list_id, 'Maps & transit', 'bookmark', 'Google Maps',        'https://maps.google.com',               0),
    (v_list_id, 'Maps & transit', 'bookmark', 'Citymapper',         'https://citymapper.com',                1),
    (v_list_id, 'Maps & transit', 'bookmark', 'Rome2Rio',           'https://www.rome2rio.com',              2),
    (v_list_id, 'Maps & transit', 'bookmark', 'OpenStreetMap',      'https://www.openstreetmap.org',         3),

    (v_list_id, 'Planning',       'bookmark', 'Wise',               'https://wise.com',                      0),
    (v_list_id, 'Planning',       'bookmark', 'XE Currency',        'https://www.xe.com',                    1),
    (v_list_id, 'Planning',       'bookmark', 'GOV.UK Foreign Travel Advice', 'https://www.gov.uk/foreign-travel-advice', 2),
    (v_list_id, 'Planning',       'bookmark', 'Wanderlog',          'https://wanderlog.com',                 3);
END$$;
