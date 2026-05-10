-- Seed Stash-Squirrel curated list: AI & Machine Learning.

DO $$
DECLARE
  v_list_id INTEGER;
BEGIN
  INSERT INTO shared_lists (slug, name, description, icon, owner_user_id, original_list_name, sort_order)
  VALUES (
    'stash-ai-ml',
    'AI & Machine Learning',
    'Chat assistants, model hubs, papers, and communities for keeping up with AI.',
    '🤖',
    'system-stash-squirrel',
    'AI & Machine Learning',
    1000
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_list_id;

  IF v_list_id IS NULL THEN RETURN; END IF;

  INSERT INTO shared_items (shared_list_id, category, type, title, url, sort_order) VALUES
    (v_list_id, 'Chat assistants', 'bookmark', 'Claude',           'https://claude.ai',                  0),
    (v_list_id, 'Chat assistants', 'bookmark', 'ChatGPT',          'https://chatgpt.com',                1),
    (v_list_id, 'Chat assistants', 'bookmark', 'Gemini',           'https://gemini.google.com',          2),
    (v_list_id, 'Chat assistants', 'bookmark', 'Perplexity',       'https://www.perplexity.ai',          3),

    (v_list_id, 'Model hubs',      'bookmark', 'Hugging Face',     'https://huggingface.co',             0),
    (v_list_id, 'Model hubs',      'bookmark', 'Replicate',        'https://replicate.com',              1),
    (v_list_id, 'Model hubs',      'bookmark', 'Together AI',      'https://www.together.ai',            2),
    (v_list_id, 'Model hubs',      'bookmark', 'OpenRouter',       'https://openrouter.ai',              3),

    (v_list_id, 'Papers',          'bookmark', 'arXiv cs.AI',      'https://arxiv.org/list/cs.AI/recent',0),
    (v_list_id, 'Papers',          'bookmark', 'Papers with Code', 'https://paperswithcode.com',         1),
    (v_list_id, 'Papers',          'bookmark', 'Anthropic Research','https://www.anthropic.com/research',2),
    (v_list_id, 'Papers',          'bookmark', 'DeepMind Publications','https://deepmind.google/discover/publications/', 3),

    (v_list_id, 'Communities',     'bookmark', 'r/LocalLLaMA',     'https://www.reddit.com/r/LocalLLaMA/',0),
    (v_list_id, 'Communities',     'bookmark', 'r/MachineLearning','https://www.reddit.com/r/MachineLearning/', 1),
    (v_list_id, 'Communities',     'bookmark', 'LessWrong',        'https://www.lesswrong.com',          2),
    (v_list_id, 'Communities',     'bookmark', 'Latent Space',     'https://www.latent.space',           3);
END$$;
