-- Seed Stash-Squirrel curated list: Developer Tools.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-developer-tools',
    'Developer Tools',
    'A starter pack of references, playgrounds, and communities for working developers.',
    '🛠️',
    'system-stash-squirrel',
    'Developer Tools',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'JavaScript / TypeScript', 'bookmark', 'MDN Web Docs',          'https://developer.mozilla.org',           0),
    (v_list_id, 'JavaScript / TypeScript', 'bookmark', 'TypeScript Handbook',   'https://www.typescriptlang.org/docs/',    1),
    (v_list_id, 'JavaScript / TypeScript', 'bookmark', 'Node.js Docs',          'https://nodejs.org/en/docs',              2),
    (v_list_id, 'JavaScript / TypeScript', 'bookmark', 'npm',                   'https://www.npmjs.com',                   3),
    (v_list_id, 'JavaScript / TypeScript', 'bookmark', 'TC39 Proposals',        'https://github.com/tc39/proposals',       4),

    (v_list_id, 'Python',                  'bookmark', 'Python Docs',           'https://docs.python.org/3/',              0),
    (v_list_id, 'Python',                  'bookmark', 'PyPI',                  'https://pypi.org',                        1),
    (v_list_id, 'Python',                  'bookmark', 'Real Python',           'https://realpython.com',                  2),
    (v_list_id, 'Python',                  'bookmark', 'PEP Index',             'https://peps.python.org',                 3),

    (v_list_id, 'Rust',                    'bookmark', 'The Rust Book',         'https://doc.rust-lang.org/book/',         0),
    (v_list_id, 'Rust',                    'bookmark', 'crates.io',             'https://crates.io',                       1),
    (v_list_id, 'Rust',                    'bookmark', 'Rust by Example',       'https://doc.rust-lang.org/rust-by-example/', 2),
    (v_list_id, 'Rust',                    'bookmark', 'This Week in Rust',     'https://this-week-in-rust.org',           3),

    (v_list_id, 'Go',                      'bookmark', 'Go Documentation',      'https://go.dev/doc/',                     0),
    (v_list_id, 'Go',                      'bookmark', 'pkg.go.dev',            'https://pkg.go.dev',                      1),
    (v_list_id, 'Go',                      'bookmark', 'Go by Example',         'https://gobyexample.com',                 2),

    (v_list_id, 'DevOps & Cloud',          'bookmark', 'Docker Hub',            'https://hub.docker.com',                  0),
    (v_list_id, 'DevOps & Cloud',          'bookmark', 'Kubernetes Docs',       'https://kubernetes.io/docs/',             1),
    (v_list_id, 'DevOps & Cloud',          'bookmark', 'AWS Documentation',     'https://docs.aws.amazon.com',             2),
    (v_list_id, 'DevOps & Cloud',          'bookmark', 'Terraform Registry',    'https://registry.terraform.io',           3),
    (v_list_id, 'DevOps & Cloud',          'bookmark', 'GitHub Actions Docs',   'https://docs.github.com/en/actions',      4),

    (v_list_id, 'AI & LLMs',               'bookmark', 'Claude',                'https://claude.ai',                       0),
    (v_list_id, 'AI & LLMs',               'bookmark', 'Anthropic Docs',        'https://docs.anthropic.com',              1),
    (v_list_id, 'AI & LLMs',               'bookmark', 'Hugging Face',          'https://huggingface.co',                  2),
    (v_list_id, 'AI & LLMs',               'bookmark', 'OpenAI Platform',       'https://platform.openai.com',             3),
    (v_list_id, 'AI & LLMs',               'bookmark', 'Papers with Code',      'https://paperswithcode.com',              4),

    (v_list_id, 'References',              'bookmark', 'Stack Overflow',        'https://stackoverflow.com',               0),
    (v_list_id, 'References',              'bookmark', 'GitHub',                'https://github.com',                      1),
    (v_list_id, 'References',              'bookmark', 'DevDocs',               'https://devdocs.io',                      2),
    (v_list_id, 'References',              'bookmark', 'Can I Use',             'https://caniuse.com',                     3),
    (v_list_id, 'References',              'bookmark', 'Regex101',              'https://regex101.com',                    4);
END$$;
