-- Seed Stash-Squirrel curated list: Finance & Investing.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-finance',
    'Finance & Investing',
    'Market data, research, personal-finance reading, and crypto trackers.',
    '💰',
    'system-stash-squirrel',
    'Finance & Investing',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Markets',          'bookmark', 'Yahoo Finance',         'https://finance.yahoo.com',                   0),
    (v_list_id, 'Markets',          'bookmark', 'Bloomberg Markets',     'https://www.bloomberg.com/markets',           1),
    (v_list_id, 'Markets',          'bookmark', 'TradingView',           'https://www.tradingview.com',                 2),
    (v_list_id, 'Markets',          'bookmark', 'Investing.com',         'https://www.investing.com',                   3),
    (v_list_id, 'Markets',          'bookmark', 'Google Finance',        'https://www.google.com/finance/',             4),

    (v_list_id, 'Research',         'bookmark', 'Morningstar',           'https://www.morningstar.com',                 0),
    (v_list_id, 'Research',         'bookmark', 'Seeking Alpha',         'https://seekingalpha.com',                    1),
    (v_list_id, 'Research',         'bookmark', 'Koyfin',                'https://www.koyfin.com',                      2),
    (v_list_id, 'Research',         'bookmark', 'Stratechery',           'https://stratechery.com',                     3),

    (v_list_id, 'Personal finance', 'bookmark', 'MoneySavingExpert',     'https://www.moneysavingexpert.com',           0),
    (v_list_id, 'Personal finance', 'bookmark', 'NerdWallet',            'https://www.nerdwallet.com',                  1),
    (v_list_id, 'Personal finance', 'bookmark', 'Monevator',             'https://monevator.com',                       2),
    (v_list_id, 'Personal finance', 'bookmark', 'Bogleheads',            'https://www.bogleheads.org',                  3),

    (v_list_id, 'Crypto',           'bookmark', 'CoinGecko',             'https://www.coingecko.com',                   0),
    (v_list_id, 'Crypto',           'bookmark', 'CoinMarketCap',         'https://coinmarketcap.com',                   1),
    (v_list_id, 'Crypto',           'bookmark', 'DeFi Llama',            'https://defillama.com',                       2),
    (v_list_id, 'Crypto',           'bookmark', 'Etherscan',             'https://etherscan.io',                        3);
END$$;
