-- Seed Stash-Squirrel curated list: Self-Hosting.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "user" WHERE id = 'system-stash-squirrel') THEN
    RAISE NOTICE 'system-stash-squirrel user missing; skipping self-hosting seed';
    RETURN;
  END IF;

  INSERT INTO shared_lists (slug, name, description, icon, category, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-self-hosting',
    'Self-Hosting',
    'Run your own photos, media, passwords and home automation — plus the maintenance rhythm that keeps a homelab from rotting.',
    '🖥️',
    'Technology',
    'system-stash-squirrel',
    'Self-Hosting',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Apps Worth Running', 'bookmark', 'Home Assistant',   'https://www.home-assistant.io',                        0),
    (v_list_id, 'Apps Worth Running', 'bookmark', 'Immich',           'https://immich.app',                                   1),
    (v_list_id, 'Apps Worth Running', 'bookmark', 'Jellyfin',         'https://jellyfin.org',                                 2),
    (v_list_id, 'Apps Worth Running', 'bookmark', 'Nextcloud',        'https://nextcloud.com',                                3),
    (v_list_id, 'Apps Worth Running', 'bookmark', 'Vaultwarden',      'https://github.com/dani-garcia/vaultwarden',           4),
    (v_list_id, 'Apps Worth Running', 'bookmark', 'Uptime Kuma',      'https://github.com/louislam/uptime-kuma',              5),

    (v_list_id, 'Community',          'bookmark', 'r/selfhosted',     'https://www.reddit.com/r/selfhosted/',                 0),
    (v_list_id, 'Community',          'bookmark', 'awesome-selfhosted', 'https://awesome-selfhosted.net',                     1),
    (v_list_id, 'Community',          'bookmark', 'selfh.st',         'https://selfh.st',                                     2),
    (v_list_id, 'Community',          'bookmark', 'Techno Tim',       'https://www.youtube.com/@TechnoTim',                   3),

    (v_list_id, 'Foundations',        'bookmark', 'Proxmox',          'https://www.proxmox.com',                              0),
    (v_list_id, 'Foundations',        'bookmark', 'Unraid',           'https://unraid.net',                                   1),
    (v_list_id, 'Foundations',        'bookmark', 'Docker Hub',       'https://hub.docker.com',                               2),
    (v_list_id, 'Foundations',        'bookmark', 'LinuxServer.io',   'https://www.linuxserver.io',                           3),
    (v_list_id, 'Foundations',        'bookmark', 'Portainer',        'https://www.portainer.io',                             4),

    (v_list_id, 'Networking',         'bookmark', 'Tailscale',        'https://tailscale.com',                                0),
    (v_list_id, 'Networking',         'bookmark', 'Caddy',            'https://caddyserver.com',                              1),
    (v_list_id, 'Networking',         'bookmark', 'Traefik',          'https://traefik.io',                                   2);

  INSERT INTO shared_items (shared_list_id, category, type, title, description, priority, repeat_days, repeat_months, sort_order) VALUES
    (v_list_id, 'Upkeep', 'todo', 'Check the backups actually ran',      'A backup you have never restored is a hope, not a backup.',   3, 7,  0, 0),
    (v_list_id, 'Upkeep', 'todo', 'Check disk space and SMART status',   '',                                                           2, 7,  0, 1),
    (v_list_id, 'Upkeep', 'todo', 'Update containers and host packages', 'Read the release notes for anything that holds data.',        2, 30, 0, 2),
    (v_list_id, 'Upkeep', 'todo', 'Review exposed services and ports',   'What is reachable from outside? Should it be?',               3, 30, 0, 3),
    (v_list_id, 'Upkeep', 'todo', 'Test-restore one backup for real',    'Pick a different service each time.',                        3, 0,  3, 4),
    (v_list_id, 'Upkeep', 'todo', 'Write down what you would need to rebuild', 'Future-you at 2am will not remember the compose file.', 2, 0,  6, 5);
END$$;
