-- Seed Stash-Squirrel curated list: Chess.
--
-- First curated list to mix both item types: a bookmark reference library plus
-- a recurring practice routine. repeat_days carry over on clone, so the routine
-- starts repeating from the day someone adds it.
--
-- Sections render alphabetically (shared.ts orders by category, sort_order),
-- so the category names are chosen to fall into a readable order.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  -- shared_lists.owner_user_id has an FK to "user" since 022. On a database
  -- where Better Auth hasn't run yet, 007 skips the system user — bail rather
  -- than fail the migration run.
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping chess seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-chess',
    'Chess',
    'Where to play, train, and follow chess — plus a practice routine that starts repeating the day you clone it.',
    '♟️',
    'Sports & Fitness',
    'system-stash-squirrel',
    'Chess',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Analysis & Openings', 'bookmark', 'Lichess Opening Explorer',   'https://lichess.org/analysis',      0),
    (v_list_id, 'Analysis & Openings', 'bookmark', '365Chess',                   'https://www.365chess.com',          1),
    (v_list_id, 'Analysis & Openings', 'bookmark', 'Chessgames.com',             'https://www.chessgames.com',        2),
    (v_list_id, 'Analysis & Openings', 'bookmark', 'Syzygy Endgame Tablebases',  'https://syzygy-tables.info',        3),
    (v_list_id, 'Analysis & Openings', 'bookmark', 'Stockfish',                  'https://stockfishchess.org',        4),
    (v_list_id, 'Analysis & Openings', 'bookmark', 'En Croissant',               'https://encroissant.org',           5),

    (v_list_id, 'Community',           'bookmark', 'r/chess',                    'https://www.reddit.com/r/chess/',   0),
    (v_list_id, 'Community',           'bookmark', 'Chess Stack Exchange',       'https://chess.stackexchange.com',   1),

    (v_list_id, 'Follow the Pros',     'bookmark', 'ChessBase News',             'https://en.chessbase.com',          0),
    (v_list_id, 'Follow the Pros',     'bookmark', 'ChessBase India',            'https://www.chessbase.in',          1),
    (v_list_id, 'Follow the Pros',     'bookmark', 'The Week in Chess',          'https://theweekinchess.com',        2),
    (v_list_id, 'Follow the Pros',     'bookmark', 'Chess.com News',             'https://www.chess.com/news',        3),
    (v_list_id, 'Follow the Pros',     'bookmark', 'FIDE',                       'https://www.fide.com',              4),
    (v_list_id, 'Follow the Pros',     'bookmark', 'FIDE Ratings',               'https://ratings.fide.com',          5),
    (v_list_id, 'Follow the Pros',     'bookmark', 'Chess-Results',              'https://chess-results.com',         6),

    (v_list_id, 'Play Online',         'bookmark', 'Lichess',                    'https://lichess.org',               0),
    (v_list_id, 'Play Online',         'bookmark', 'Chess.com',                  'https://www.chess.com',             1),
    (v_list_id, 'Play Online',         'bookmark', 'Lichess TV',                 'https://lichess.org/tv',            2),
    (v_list_id, 'Play Online',         'bookmark', 'ChessKid',                   'https://www.chesskid.com',          3),

    (v_list_id, 'Puzzles & Training',  'bookmark', 'Lichess Puzzles',            'https://lichess.org/training',      0),
    (v_list_id, 'Puzzles & Training',  'bookmark', 'Chess.com Puzzles',          'https://www.chess.com/puzzles',     1),
    (v_list_id, 'Puzzles & Training',  'bookmark', 'Lichess Practice',           'https://lichess.org/practice',      2),
    (v_list_id, 'Puzzles & Training',  'bookmark', 'Chessable',                  'https://www.chessable.com',         3),
    (v_list_id, 'Puzzles & Training',  'bookmark', 'ChessTempo',                 'https://chesstempo.com',            4),
    (v_list_id, 'Puzzles & Training',  'bookmark', 'Aimchess',                   'https://aimchess.com',              5),

    (v_list_id, 'Watch & Learn',       'bookmark', 'GothamChess',                'https://www.youtube.com/@GothamChess',          0),
    (v_list_id, 'Watch & Learn',       'bookmark', 'Daniel Naroditsky',          'https://www.youtube.com/@DanielNaroditskyGM',   1),
    (v_list_id, 'Watch & Learn',       'bookmark', 'agadmator''s Chess Channel', 'https://www.youtube.com/@agadmator',            2),
    (v_list_id, 'Watch & Learn',       'bookmark', 'Saint Louis Chess Club',     'https://www.youtube.com/@STLChessClub',         3),
    (v_list_id, 'Watch & Learn',       'bookmark', 'ChessDojo',                  'https://www.chessdojo.club',                    4);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, sort_order) VALUES
    (v_list_id, 'Practice Routine', 'todo', '15 minutes of tactics puzzles',      'Rated puzzles, no hints. Consistency beats volume.',       2, 1,  0),
    (v_list_id, 'Practice Routine', 'todo', 'Play one long game (15+10 or slower)', 'Blitz is fun; long games are where the improvement is.', 2, 1,  1),
    (v_list_id, 'Practice Routine', 'todo', 'Analyse your last loss engine-free',  'Write your own assessment first, then turn Stockfish on.', 2, 3,  2),
    (v_list_id, 'Practice Routine', 'todo', 'Drill one endgame pattern',           'Rotate weekly: K+P, rook endings, opposition.',            2, 7,  3),
    (v_list_id, 'Practice Routine', 'todo', 'Review your opening repertoire gaps', 'Where did you leave book? Add that line to a study.',      1, 7,  4),
    (v_list_id, 'Practice Routine', 'todo', 'Watch one annotated master game',     'Pause before each move and guess it.',                     1, 7,  5),
    (v_list_id, 'Practice Routine', 'todo', 'Rating check-in and goal review',     'What is actually improving, and what is not?',             1, 30, 6);
END$$;
