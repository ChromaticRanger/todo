-- Seed Stash-Squirrel curated list: Running.
-- Picks up where Couch to 5K stops: 5K to half-marathon and beyond.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping running seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-running',
    'Running',
    'For when 5K is no longer the goal: training plans, pace calculators, route tools, races and a weekly training rhythm.',
    '🏃',
    'Sports & Fitness',
    'system-stash-squirrel',
    'Running',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Community',        'bookmark', 'parkrun',              'https://www.parkrun.org.uk',                    0),
    (v_list_id, 'Community',        'bookmark', 'r/running',            'https://www.reddit.com/r/running/',             1),
    (v_list_id, 'Community',        'bookmark', 'r/AdvancedRunning',    'https://www.reddit.com/r/AdvancedRunning/',     2),
    (v_list_id, 'Community',        'bookmark', 'The Running Channel',  'https://www.youtube.com/@TheRunningChannel',    3),

    (v_list_id, 'Races',            'bookmark', 'Find a Race',          'https://findarace.com',                         0),
    (v_list_id, 'Races',            'bookmark', 'Great Run',            'https://www.greatrun.org',                      1),
    (v_list_id, 'Races',            'bookmark', 'TCS London Marathon',  'https://www.tcslondonmarathon.com',             2),

    (v_list_id, 'Routes & Tracking','bookmark', 'Strava',               'https://www.strava.com',                        0),
    (v_list_id, 'Routes & Tracking','bookmark', 'Garmin Connect',       'https://connect.garmin.com',                    1),
    (v_list_id, 'Routes & Tracking','bookmark', 'komoot',               'https://www.komoot.com',                        2),
    (v_list_id, 'Routes & Tracking','bookmark', 'Plotaroute',           'https://www.plotaroute.com',                    3),

    (v_list_id, 'Training & Kit',   'bookmark', 'Hal Higdon Plans',     'https://www.halhigdon.com',                     0),
    (v_list_id, 'Training & Kit',   'bookmark', 'VDOT O2 Pace Calculator', 'https://vdoto2.com',                         1),
    (v_list_id, 'Training & Kit',   'bookmark', 'Runner''s World UK',   'https://www.runnersworld.com/uk/',              2),
    (v_list_id, 'Training & Kit',   'bookmark', 'RunnersConnect',       'https://runnersconnect.net',                    3),
    (v_list_id, 'Training & Kit',   'bookmark', 'Science of Running',   'https://www.scienceofrunning.com',              4),
    (v_list_id, 'Training & Kit',   'bookmark', 'SportsShoes',          'https://www.sportsshoes.com',                   5);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Training Week', 'todo', 'Easy run',                    'Conversational pace. Most of your mileage lives here.',       2, 7,  0),
    (v_list_id, 'Training Week', 'todo', 'Intervals or tempo session',  'One hard session a week is plenty for most people.',          2, 7,  1),
    (v_list_id, 'Training Week', 'todo', 'Long run',                    'Build it by no more than 10% a week.',                        2, 7,  2),
    (v_list_id, 'Training Week', 'todo', 'Strength and mobility, 20 minutes', 'Hips, glutes, calves. This is what prevents injury.',    2, 7,  3),
    (v_list_id, 'Training Week', 'todo', 'One full rest day',           'Non-negotiable. Adaptation happens on rest days.',            2, 7,  4),
    (v_list_id, 'Training Week', 'todo', 'Check shoe mileage',          'Most road shoes are done between 500 and 800 km.',            1, 30, 5),
    (v_list_id, 'Training Week', 'todo', 'Review the month and set the next goal', '',                                                 1, 30, 6);
END$$;
