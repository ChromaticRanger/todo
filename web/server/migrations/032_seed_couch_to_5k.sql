-- Seed Stash-Squirrel curated list: Couch to 5K.
--
-- First curated list built on a *progression* rather than a routine. The 27
-- workouts are plain todos (repeat_days = 0) grouped into Week 1..Week 9 —
-- a fixed-interval repeat would be wrong here, because each session differs.
-- Sections render alphabetically, so "Week N" sorts naturally after the
-- reference sections.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping couch-to-5k seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-couch-to-5k',
    'Couch to 5K',
    'The full nine-week beginner running programme as 27 tick-off workouts, plus the gear, apps and reading to go with it.',
    '🏃',
    'Health & Wellness',
    'system-stash-squirrel',
    'Couch to 5K',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Before You Start', 'bookmark', 'NHS Couch to 5K',            'https://www.nhs.uk/live-well/exercise/running-and-aerobic-exercises/get-running-with-couch-to-5k/', 0),
    (v_list_id, 'Before You Start', 'bookmark', 'NHS Exercise Guidelines',    'https://www.nhs.uk/live-well/exercise/',        1),
    (v_list_id, 'Before You Start', 'bookmark', 'Runner''s World Beginners',  'https://www.runnersworld.com/uk/beginners/',    2),
    (v_list_id, 'Before You Start', 'bookmark', 'Hal Higdon Training Plans',  'https://www.halhigdon.com',                     3),

    (v_list_id, 'Community',        'bookmark', 'parkrun',                    'https://www.parkrun.org.uk',                    0),
    (v_list_id, 'Community',        'bookmark', 'r/C25K',                     'https://www.reddit.com/r/C25K/',                1),
    (v_list_id, 'Community',        'bookmark', 'r/running',                  'https://www.reddit.com/r/running/',             2),

    (v_list_id, 'Gear & Apps',      'bookmark', 'Strava',                     'https://www.strava.com',                        0),
    (v_list_id, 'Gear & Apps',      'bookmark', 'Nike Run Club',              'https://www.nike.com/gb/nrc-app',               1),
    (v_list_id, 'Gear & Apps',      'bookmark', 'Runkeeper',                  'https://runkeeper.com',                         2),
    (v_list_id, 'Gear & Apps',      'bookmark', 'MapMyRun',                   'https://www.mapmyrun.com',                      3),
    (v_list_id, 'Gear & Apps',      'bookmark', 'Runner''s World Gear',       'https://www.runnersworld.com/uk/gear/',         4);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, sort_order) VALUES
    (v_list_id, 'Week 1', 'todo', 'Week 1 · Run 1', 'Brisk 5-minute walk, then 60 seconds running / 90 seconds walking, eight times.', 2, 0),
    (v_list_id, 'Week 1', 'todo', 'Week 1 · Run 2', 'Brisk 5-minute walk, then 60 seconds running / 90 seconds walking, eight times.', 2, 1),
    (v_list_id, 'Week 1', 'todo', 'Week 1 · Run 3', 'Brisk 5-minute walk, then 60 seconds running / 90 seconds walking, eight times.', 2, 2),

    (v_list_id, 'Week 2', 'todo', 'Week 2 · Run 1', 'Brisk 5-minute walk, then 90 seconds running / 2 minutes walking, six times.',    2, 0),
    (v_list_id, 'Week 2', 'todo', 'Week 2 · Run 2', 'Brisk 5-minute walk, then 90 seconds running / 2 minutes walking, six times.',    2, 1),
    (v_list_id, 'Week 2', 'todo', 'Week 2 · Run 3', 'Brisk 5-minute walk, then 90 seconds running / 2 minutes walking, six times.',    2, 2),

    (v_list_id, 'Week 3', 'todo', 'Week 3 · Run 1', 'Warm up, then twice: 90s run, 90s walk, 3 min run, 3 min walk.',                  2, 0),
    (v_list_id, 'Week 3', 'todo', 'Week 3 · Run 2', 'Warm up, then twice: 90s run, 90s walk, 3 min run, 3 min walk.',                  2, 1),
    (v_list_id, 'Week 3', 'todo', 'Week 3 · Run 3', 'Warm up, then twice: 90s run, 90s walk, 3 min run, 3 min walk.',                  2, 2),

    (v_list_id, 'Week 4', 'todo', 'Week 4 · Run 1', 'Warm up, then 3 min run, 90s walk, 5 min run, 2.5 min walk, 3 min run, 90s walk, 5 min run.', 2, 0),
    (v_list_id, 'Week 4', 'todo', 'Week 4 · Run 2', 'Warm up, then 3 min run, 90s walk, 5 min run, 2.5 min walk, 3 min run, 90s walk, 5 min run.', 2, 1),
    (v_list_id, 'Week 4', 'todo', 'Week 4 · Run 3', 'Warm up, then 3 min run, 90s walk, 5 min run, 2.5 min walk, 3 min run, 90s walk, 5 min run.', 2, 2),

    (v_list_id, 'Week 5', 'todo', 'Week 5 · Run 1', 'Warm up, then 5 min run, 3 min walk, 5 min run, 3 min walk, 5 min run.',          2, 0),
    (v_list_id, 'Week 5', 'todo', 'Week 5 · Run 2', 'Warm up, then 8 min run, 5 min walk, 8 min run.',                                 2, 1),
    (v_list_id, 'Week 5', 'todo', 'Week 5 · Run 3', 'Warm up, then 20 minutes running with no walking. The big one — trust the plan.', 3, 2),

    (v_list_id, 'Week 6', 'todo', 'Week 6 · Run 1', 'Warm up, then 5 min run, 3 min walk, 8 min run, 3 min walk, 5 min run.',          2, 0),
    (v_list_id, 'Week 6', 'todo', 'Week 6 · Run 2', 'Warm up, then 10 min run, 3 min walk, 10 min run.',                               2, 1),
    (v_list_id, 'Week 6', 'todo', 'Week 6 · Run 3', 'Warm up, then 25 minutes running with no walking.',                               2, 2),

    (v_list_id, 'Week 7', 'todo', 'Week 7 · Run 1', 'Warm up, then 25 minutes running.',                                               2, 0),
    (v_list_id, 'Week 7', 'todo', 'Week 7 · Run 2', 'Warm up, then 25 minutes running.',                                               2, 1),
    (v_list_id, 'Week 7', 'todo', 'Week 7 · Run 3', 'Warm up, then 25 minutes running.',                                               2, 2),

    (v_list_id, 'Week 8', 'todo', 'Week 8 · Run 1', 'Warm up, then 28 minutes running.',                                               2, 0),
    (v_list_id, 'Week 8', 'todo', 'Week 8 · Run 2', 'Warm up, then 28 minutes running.',                                               2, 1),
    (v_list_id, 'Week 8', 'todo', 'Week 8 · Run 3', 'Warm up, then 28 minutes running.',                                               2, 2),

    (v_list_id, 'Week 9', 'todo', 'Week 9 · Run 1', 'Warm up, then 30 minutes running.',                                               2, 0),
    (v_list_id, 'Week 9', 'todo', 'Week 9 · Run 2', 'Warm up, then 30 minutes running.',                                               2, 1),
    (v_list_id, 'Week 9', 'todo', 'Week 9 · Run 3', 'Warm up, then 30 minutes running. That is 5K — go and find a parkrun.',           3, 2);
END$$;
