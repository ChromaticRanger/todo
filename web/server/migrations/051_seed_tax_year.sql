-- Seed Stash-Squirrel curated list: Tax Year Checklist.
-- UK tax year runs 6 April to 5 April. Annual jobs use repeat_months = 12.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping tax-year seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-tax-year',
    'Tax Year Checklist',
    'UK tax-year housekeeping that repeats annually: allowances to use before 5 April, and the self-assessment run-up.',
    '🧾',
    'Money & Finance',
    'system-stash-squirrel',
    'Tax Year Checklist',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Allowances',       'bookmark', 'ISAs (gov.uk)',            'https://www.gov.uk/individual-savings-accounts',    0),
    (v_list_id, 'Allowances',       'bookmark', 'Pension Tax Relief (gov.uk)', 'https://www.gov.uk/tax-on-your-private-pension', 1),
    (v_list_id, 'Allowances',       'bookmark', 'Capital Gains Tax (gov.uk)', 'https://www.gov.uk/capital-gains-tax',            2),
    (v_list_id, 'Allowances',       'bookmark', 'Marriage Allowance (gov.uk)', 'https://www.gov.uk/marriage-allowance',          3),

    (v_list_id, 'Get Help',         'bookmark', 'MoneyHelper',              'https://www.moneyhelper.org.uk',                    0),
    (v_list_id, 'Get Help',         'bookmark', 'Low Incomes Tax Reform Group', 'https://www.litrg.org.uk',                      1),
    (v_list_id, 'Get Help',         'bookmark', 'MSE Tax Rates',            'https://www.moneysavingexpert.com/banking/tax-rates/', 2),
    (v_list_id, 'Get Help',         'bookmark', 'TaxScouts',                'https://taxscouts.com',                             3),

    (v_list_id, 'HMRC',             'bookmark', 'Personal Tax Account',     'https://www.gov.uk/personal-tax-account',           0),
    (v_list_id, 'HMRC',             'bookmark', 'Self Assessment',          'https://www.gov.uk/self-assessment-tax-returns',    1),
    (v_list_id, 'HMRC',             'bookmark', 'Check Your Income Tax',    'https://www.gov.uk/check-income-tax-current-year',  2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, repeat_months, sort_order) VALUES
    (v_list_id, 'Before 5 April',   'todo', 'Use this year''s ISA allowance',   'Unused allowance does not carry over. It is gone.',           3, 0, 12, 0),
    (v_list_id, 'Before 5 April',   'todo', 'Check your pension contributions', 'Tax relief plus any employer match you are leaving unclaimed.', 3, 0, 12, 1),
    (v_list_id, 'Before 5 April',   'todo', 'Use your capital gains allowance', 'Relevant if you hold shares or funds outside an ISA.',        2, 0, 12, 2),
    (v_list_id, 'Before 5 April',   'todo', 'Check marriage allowance eligibility', 'Worth a few hundred pounds if one of you is a non-taxpayer.', 2, 0, 12, 3),
    (v_list_id, 'Before 5 April',   'todo', 'Claim work-from-home or uniform expenses', 'You can usually backdate several years.',             2, 0, 12, 4),
    (v_list_id, 'Before 5 April',   'todo', 'Check your tax code is right',     'A wrong code quietly costs you all year.',                    2, 0, 12, 5),
    (v_list_id, 'Before 5 April',   'todo', 'Make any charity donations you planned', 'Gift Aid extends your basic-rate band.',                 1, 0, 12, 6),

    (v_list_id, 'Self Assessment',  'todo', 'Register if this is your first return', 'Deadline is 5 October after the tax year ends.',         3, 0, 12, 0),
    (v_list_id, 'Self Assessment',  'todo', 'Gather P60, P45, P11D and interest statements', '',                                              2, 0, 12, 1),
    (v_list_id, 'Self Assessment',  'todo', 'File the return',                  'Online deadline is 31 January. Do not do it on 31 January.',   3, 0, 12, 2),
    (v_list_id, 'Self Assessment',  'todo', 'Pay the bill and any payment on account', 'Second payment on account falls due 31 July.',         3, 0, 12, 3),

    (v_list_id, 'Keep On Top',      'todo', 'File receipts and statements as they arrive', 'Ten minutes a month beats a lost weekend in January.', 1, 0, 1, 0),
    (v_list_id, 'Keep On Top',      'todo', 'Check your payslip and tax code',  '',                                                            1, 0, 1, 1);
END$$;
