-- Seed Stash-Squirrel curated list: Weekly Household Chores.
-- Demonstrates the multi-type story: recurring todos, not bookmarks.
-- repeat_days values get carried over on clone; absolute due_dates are not.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-household-chores',
    'Household Chores',
    'A starter checklist of recurring household tasks. Clone it and it starts repeating from the day you add it.',
    '🧹',
    'system-stash-squirrel',
    'Household Chores',
    900
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Daily',   'todo', 'Make the bed',                'Two minutes — sets the tone for the day.', 1, 1,  0),
    (v_list_id, 'Daily',   'todo', 'Wipe kitchen counters',       '',                                          1, 1,  1),
    (v_list_id, 'Daily',   'todo', 'Empty the dishwasher',        'Run overnight, empty in the morning.',      2, 1,  2),
    (v_list_id, 'Daily',   'todo', '10-minute tidy-up',           'Pick a room, set a timer.',                 1, 1,  3),

    (v_list_id, 'Weekly',  'todo', 'Hoover and mop floors',       '',                                          2, 7,  0),
    (v_list_id, 'Weekly',  'todo', 'Clean bathrooms',             'Loo, basin, shower, mirrors.',              2, 7,  1),
    (v_list_id, 'Weekly',  'todo', 'Wash bedding',                'Strip, wash, remake.',                      2, 7,  2),
    (v_list_id, 'Weekly',  'todo', 'Take bins out',               'Check the council schedule.',               2, 7,  3),
    (v_list_id, 'Weekly',  'todo', 'Plan meals & food shop',      '',                                          2, 7,  4),

    (v_list_id, 'Monthly', 'todo', 'Deep clean the fridge',       'Toss expired items, wipe shelves.',         2, 30, 0),
    (v_list_id, 'Monthly', 'todo', 'Descale kettle and shower',   '',                                          1, 30, 1),
    (v_list_id, 'Monthly', 'todo', 'Check smoke alarm batteries', 'Press and hold to test.',                   3, 30, 2),
    (v_list_id, 'Monthly', 'todo', 'Wash windows',                'Inside at minimum; outside if dry.',        1, 30, 3);
END$$;
