-- Seed Stash-Squirrel curated list: Mental Health Toolkit.
--
-- Deliberate departure from the house style: bookmarks in the crisis section
-- carry descriptions, because the contact method (phone vs text, and which
-- country) is the single most useful thing to show. Section names are chosen
-- so "Crisis Support" sorts first under the alphabetical ordering.
--
-- Every helpline here was checked against its own site. If any of these change,
-- fix them promptly — a dead crisis link is worse than no link.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping mental-health seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-mental-health',
    'Mental Health Toolkit',
    'Crisis lines, self-help resources and a light daily check-in routine. Not a substitute for professional care — if you are struggling, talk to your GP.',
    '🧠',
    'Health & Wellness',
    'system-stash-squirrel',
    'Mental Health Toolkit',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, description, url, sort_order) VALUES
    (v_list_id, 'Crisis Support', 'bookmark', 'Samaritans (UK & ROI)',       'Free, 24/7. Call 116 123 from any phone.',        'https://www.samaritans.org',      0),
    (v_list_id, 'Crisis Support', 'bookmark', 'Shout (UK)',                  'Free 24/7 text support. Text SHOUT to 85258.',    'https://giveusashout.org',        1),
    (v_list_id, 'Crisis Support', 'bookmark', '988 Suicide & Crisis Lifeline (US)', 'Call or text 988, 24/7.',                  'https://988lifeline.org',         2),
    (v_list_id, 'Crisis Support', 'bookmark', 'Crisis Text Line (US)',       'Text HOME to 741741.',                            'https://www.crisistextline.org',  3),
    (v_list_id, 'Crisis Support', 'bookmark', 'Find a Helpline (worldwide)', 'Look up a verified helpline in any country.',      'https://findahelpline.com',       4),
    (v_list_id, 'Crisis Support', 'bookmark', 'NHS Mental Health',           'Urgent help, self-referral and local services.',   'https://www.nhs.uk/mental-health/', 5);

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Everyday Tools', 'bookmark', 'Headspace',        'https://www.headspace.com',       0),
    (v_list_id, 'Everyday Tools', 'bookmark', 'Calm',             'https://www.calm.com',            1),
    (v_list_id, 'Everyday Tools', 'bookmark', 'Insight Timer',    'https://insighttimer.com',        2),
    (v_list_id, 'Everyday Tools', 'bookmark', 'Ten Percent Happier', 'https://www.tenpercent.com',   3),
    (v_list_id, 'Everyday Tools', 'bookmark', 'MoodGYM',          'https://moodgym.com.au',          4),

    (v_list_id, 'Learn More',     'bookmark', 'Mind',             'https://www.mind.org.uk',         0),
    (v_list_id, 'Learn More',     'bookmark', 'Mental Health Foundation', 'https://www.mentalhealth.org.uk', 1),
    (v_list_id, 'Learn More',     'bookmark', 'CCI Self-Help Workbooks', 'https://www.cci.health.wa.gov.au/Resources/Looking-After-Yourself', 2),
    (v_list_id, 'Learn More',     'bookmark', 'r/mentalhealth',   'https://www.reddit.com/r/mentalhealth/', 3);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Practice Routine', 'todo', 'Three lines in a journal',        'What happened, how it felt, what you would tell a friend.', 1, 1,  0),
    (v_list_id, 'Practice Routine', 'todo', 'Name one thing you are grateful for', '',                                                    1, 1,  1),
    (v_list_id, 'Practice Routine', 'todo', 'Get outside for ten minutes',      'Daylight and movement, no phone.',                        2, 1,  2),
    (v_list_id, 'Practice Routine', 'todo', 'Message someone you have not spoken to', 'Connection is the highest-leverage habit here.',    2, 7,  0),
    (v_list_id, 'Practice Routine', 'todo', 'Weekly check-in with yourself',    'Sleep, food, movement, people. Which one slipped?',        2, 7,  1),
    (v_list_id, 'Practice Routine', 'todo', 'Review your support network',      'Who would you actually call on a bad day? Is that current?', 1, 30, 2);
END$$;
