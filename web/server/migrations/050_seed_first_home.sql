-- Seed Stash-Squirrel curated list: First Home Buyer.
-- UK-specific — the gov.uk and Land Registry links assume England/Wales.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping first-home seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-first-home',
    'First Home Buyer',
    'The UK buying process as a checklist, from working out what you can borrow to picking up the keys.',
    '🏠',
    'Money & Finance',
    'system-stash-squirrel',
    'First Home Buyer',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Advice & Rules',   'bookmark', 'MoneyHelper',          'https://www.moneyhelper.org.uk',                       0),
    (v_list_id, 'Advice & Rules',   'bookmark', 'MSE Mortgage Guides',  'https://www.moneysavingexpert.com/mortgages/',         1),
    (v_list_id, 'Advice & Rules',   'bookmark', 'HomeOwners Alliance',  'https://hoa.org.uk',                                   2),
    (v_list_id, 'Advice & Rules',   'bookmark', 'Which? Mortgages',     'https://www.which.co.uk/money/mortgages-and-property', 3),
    (v_list_id, 'Advice & Rules',   'bookmark', 'Stamp Duty (gov.uk)',  'https://www.gov.uk/stamp-duty-land-tax',               4),
    (v_list_id, 'Advice & Rules',   'bookmark', 'Lifetime ISA (gov.uk)', 'https://www.gov.uk/lifetime-isa',                     5),

    (v_list_id, 'Community',        'bookmark', 'r/HousingUK',          'https://www.reddit.com/r/HousingUK/',                  0),

    (v_list_id, 'Due Diligence',    'bookmark', 'Land Registry Price Paid', 'https://landregistry.data.gov.uk/app/ppd',         0),
    (v_list_id, 'Due Diligence',    'bookmark', 'Long-Term Flood Risk',  'https://check-long-term-flood-risk.service.gov.uk',    1),
    (v_list_id, 'Due Diligence',    'bookmark', 'Checkmyfile',           'https://www.checkmyfile.com',                         2),
    (v_list_id, 'Due Diligence',    'bookmark', 'Experian',              'https://www.experian.co.uk',                          3),

    (v_list_id, 'Search',           'bookmark', 'Rightmove',             'https://www.rightmove.co.uk',                         0),
    (v_list_id, 'Search',           'bookmark', 'Zoopla',                'https://www.zoopla.co.uk',                            1),
    (v_list_id, 'Search',           'bookmark', 'OnTheMarket',           'https://www.onthemarket.com',                         2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, sort_order) VALUES
    (v_list_id, 'Step 1 · Get Your Money Straight', 'todo', 'Check your credit file on all three agencies', 'Fix errors now — they take weeks to correct.',        3, 0),
    (v_list_id, 'Step 1 · Get Your Money Straight', 'todo', 'Work out your real deposit',       'Include the 1-3% of extra costs everyone forgets.',              3, 1),
    (v_list_id, 'Step 1 · Get Your Money Straight', 'todo', 'Budget for the hidden costs',      'Survey, solicitor, searches, stamp duty, removals.',             3, 2),
    (v_list_id, 'Step 1 · Get Your Money Straight', 'todo', 'Check if a Lifetime ISA helps',    'Government bonus, but rules on price caps and withdrawal apply.', 2, 3),
    (v_list_id, 'Step 1 · Get Your Money Straight', 'todo', 'Get a mortgage in principle',      'Agents will not take you seriously without one.',                3, 4),

    (v_list_id, 'Step 2 · Find the Place',          'todo', 'Set up alerts on all three portals', 'Good ones go in days.',                                        2, 0),
    (v_list_id, 'Step 2 · Find the Place',          'todo', 'Check sold prices on the street',  'Land Registry data tells you what the asking price is worth.',   2, 1),
    (v_list_id, 'Step 2 · Find the Place',          'todo', 'Visit at different times of day',  'Traffic, noise and parking change completely by evening.',       2, 2),
    (v_list_id, 'Step 2 · Find the Place',          'todo', 'Check flood risk and broadband speed', '',                                                           2, 3),
    (v_list_id, 'Step 2 · Find the Place',          'todo', 'If leasehold, ask for the lease length and service charge', 'Short leases are expensive to fix.',     3, 4),

    (v_list_id, 'Step 3 · Offer to Keys',           'todo', 'Make an offer and get it confirmed in writing', '',                                                  3, 0),
    (v_list_id, 'Step 3 · Offer to Keys',           'todo', 'Instruct a solicitor or conveyancer', 'Ask for a fixed fee and their average completion time.',      3, 1),
    (v_list_id, 'Step 3 · Offer to Keys',           'todo', 'Book a survey, not just the lender valuation', 'A level 2 or 3 survey is the best money you will spend.', 3, 2),
    (v_list_id, 'Step 3 · Offer to Keys',           'todo', 'Submit the full mortgage application', '',                                                           3, 3),
    (v_list_id, 'Step 3 · Offer to Keys',           'todo', 'Review the searches and raise enquiries', 'Read them yourself. Ask about anything you do not follow.', 2, 4),
    (v_list_id, 'Step 3 · Offer to Keys',           'todo', 'Arrange buildings insurance from exchange', 'You are liable from exchange, not completion.',          3, 5),
    (v_list_id, 'Step 3 · Offer to Keys',           'todo', 'Exchange, then complete',          'Read the contract properly before you sign it.',                 3, 6);
END$$;
