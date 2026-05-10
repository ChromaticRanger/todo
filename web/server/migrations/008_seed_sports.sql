-- Seed Stash-Squirrel curated list: Sports.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-sports',
    'Sports',
    'Hand-picked links to scores, news, and analysis across the major sports.',
    '⚽',
    'system-stash-squirrel',
    'Sports',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Football',   'bookmark', 'BBC Sport · Football',     'https://www.bbc.co.uk/sport/football',     0),
    (v_list_id, 'Football',   'bookmark', 'Sky Sports Football',       'https://www.skysports.com/football',       1),
    (v_list_id, 'Football',   'bookmark', 'The Athletic',              'https://theathletic.com/football/',        2),
    (v_list_id, 'Football',   'bookmark', 'FotMob',                    'https://www.fotmob.com',                   3),
    (v_list_id, 'Football',   'bookmark', 'Premier League',            'https://www.premierleague.com',            4),

    (v_list_id, 'NFL',        'bookmark', 'NFL.com',                   'https://www.nfl.com',                      0),
    (v_list_id, 'NFL',        'bookmark', 'ESPN NFL',                  'https://www.espn.com/nfl/',                1),
    (v_list_id, 'NFL',        'bookmark', 'Pro Football Reference',    'https://www.pro-football-reference.com',   2),
    (v_list_id, 'NFL',        'bookmark', 'The Ringer NFL',            'https://www.theringer.com/nfl',            3),

    (v_list_id, 'Basketball', 'bookmark', 'NBA.com',                   'https://www.nba.com',                      0),
    (v_list_id, 'Basketball', 'bookmark', 'ESPN NBA',                  'https://www.espn.com/nba/',                1),
    (v_list_id, 'Basketball', 'bookmark', 'Basketball Reference',      'https://www.basketball-reference.com',     2),
    (v_list_id, 'Basketball', 'bookmark', 'NBA Reddit',                'https://www.reddit.com/r/nba/',            3),

    (v_list_id, 'Tennis',     'bookmark', 'ATP Tour',                  'https://www.atptour.com',                  0),
    (v_list_id, 'Tennis',     'bookmark', 'WTA Tour',                  'https://www.wtatennis.com',                1),
    (v_list_id, 'Tennis',     'bookmark', 'Tennis.com',                'https://www.tennis.com',                   2),
    (v_list_id, 'Tennis',     'bookmark', 'BBC Tennis',                'https://www.bbc.co.uk/sport/tennis',       3),

    (v_list_id, 'Formula 1',  'bookmark', 'Formula1.com',              'https://www.formula1.com',                 0),
    (v_list_id, 'Formula 1',  'bookmark', 'Autosport',                 'https://www.autosport.com',                1),
    (v_list_id, 'Formula 1',  'bookmark', 'The Race',                  'https://www.the-race.com',                 2),
    (v_list_id, 'Formula 1',  'bookmark', 'r/formula1',                'https://www.reddit.com/r/formula1/',       3),

    (v_list_id, 'Cricket',    'bookmark', 'ESPNcricinfo',              'https://www.espncricinfo.com',             0),
    (v_list_id, 'Cricket',    'bookmark', 'BBC Cricket',               'https://www.bbc.co.uk/sport/cricket',      1),
    (v_list_id, 'Cricket',    'bookmark', 'Cricbuzz',                  'https://www.cricbuzz.com',                 2),
    (v_list_id, 'Cricket',    'bookmark', 'ICC',                       'https://www.icc-cricket.com',              3);
END$$;
