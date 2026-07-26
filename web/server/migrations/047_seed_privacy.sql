-- Seed Stash-Squirrel curated list: Privacy & Security Checkup.
-- The whole point is the quarterly repeat — repeat_months = 3 on the audit.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping privacy seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-privacy-checkup',
    'Privacy & Security Checkup',
    'A quarterly audit that repeats itself: password hygiene, 2FA, breach checks and permission sweeps. Clone it once and forget about it.',
    '🔐',
    'Technology',
    'system-stash-squirrel',
    'Privacy & Security Checkup',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Check Yourself',   'bookmark', 'Have I Been Pwned',    'https://haveibeenpwned.com',                          0),
    (v_list_id, 'Check Yourself',   'bookmark', 'Google Security Checkup', 'https://myaccount.google.com/security-checkup',    1),
    (v_list_id, 'Check Yourself',   'bookmark', 'JustDeleteMe',         'https://justdeleteme.xyz',                            2),

    (v_list_id, 'Learn',            'bookmark', 'Privacy Guides',       'https://www.privacyguides.org',                       0),
    (v_list_id, 'Learn',            'bookmark', 'EFF Surveillance Self-Defense', 'https://ssd.eff.org',                        1),
    (v_list_id, 'Learn',            'bookmark', 'NCSC Cyber Aware',     'https://www.ncsc.gov.uk/cyberaware/home',             2),
    (v_list_id, 'Learn',            'bookmark', 'Privacy Not Included', 'https://foundation.mozilla.org/en/privacynotincluded/', 3),
    (v_list_id, 'Learn',            'bookmark', 'r/privacy',            'https://www.reddit.com/r/privacy/',                   4),

    (v_list_id, 'Tools',            'bookmark', 'Bitwarden',            'https://bitwarden.com',                               0),
    (v_list_id, 'Tools',            'bookmark', '1Password',            'https://1password.com',                               1),
    (v_list_id, 'Tools',            'bookmark', 'Aegis Authenticator',  'https://getaegis.app',                                2),
    (v_list_id, 'Tools',            'bookmark', 'Signal',               'https://signal.org',                                  3),
    (v_list_id, 'Tools',            'bookmark', 'uBlock Origin',        'https://ublockorigin.com',                            4),
    (v_list_id, 'Tools',            'bookmark', 'Tailscale',            'https://tailscale.com',                               5);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, repeat_months, sort_order) VALUES
    (v_list_id, 'Quarterly Audit', 'todo', 'Run a breach check on every email address', 'Have I Been Pwned. Change anything it flags.',            3, 0, 3, 0),
    (v_list_id, 'Quarterly Audit', 'todo', 'Fix reused and weak passwords',   'Your password manager already has the report. Work the list.',      3, 0, 3, 1),
    (v_list_id, 'Quarterly Audit', 'todo', 'Turn on 2FA anywhere it is missing', 'App-based or a hardware key. Avoid SMS where you can.',          3, 0, 3, 2),
    (v_list_id, 'Quarterly Audit', 'todo', 'Print or re-store your recovery codes', 'The step everyone skips and later regrets.',                  3, 0, 3, 3),
    (v_list_id, 'Quarterly Audit', 'todo', 'Review third-party app access',   'Google, Microsoft, GitHub, Apple. Revoke what you do not recognise.', 2, 0, 3, 4),
    (v_list_id, 'Quarterly Audit', 'todo', 'Review phone app permissions',    'Location, microphone, camera, contacts.',                           2, 0, 3, 5),
    (v_list_id, 'Quarterly Audit', 'todo', 'Check devices signed into your accounts', 'Sign out anything old or unfamiliar.',                      2, 0, 3, 6),
    (v_list_id, 'Quarterly Audit', 'todo', 'Verify backups exist and restore', 'Ransomware makes this the one that matters.',                      3, 0, 3, 7),
    (v_list_id, 'Quarterly Audit', 'todo', 'Delete accounts you no longer use', 'Fewer accounts, less to breach.',                                 1, 0, 3, 8),
    (v_list_id, 'Quarterly Audit', 'todo', 'Update OS and firmware on everything', 'Phone, laptop, router, anything else on the network.',         2, 0, 3, 9);
END$$;
