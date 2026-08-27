-- Immutable migration: replace provider routes that failed the production capability/eval gates.
-- Historical request and benchmark rows remain untouched as audit evidence.
UPDATE conversation_settings
SET model_profile_id = 'velora-balanced'
WHERE model_profile_id IN ('velora-qwen-story', 'velora-chimera', 'velora-kimi-epic');

UPDATE character_avatar_bots
SET model_profile_id = 'velora-balanced', updated_at = unixepoch() * 1000
WHERE model_profile_id IN ('velora-qwen-story', 'velora-chimera', 'velora-kimi-epic');

UPDATE roleplay_model_default
SET model_profile_id = 'velora-balanced', updated_at = unixepoch() * 1000, updated_by = NULL
WHERE model_profile_id IN ('velora-qwen-story', 'velora-chimera', 'velora-kimi-epic');

UPDATE roleplay_model_overrides
SET enabled = 0, updated_at = unixepoch() * 1000, updated_by = NULL
WHERE model_profile_id IN ('velora-qwen-story', 'velora-chimera', 'velora-kimi-epic');

INSERT OR IGNORE INTO roleplay_model_overrides
  (model_profile_id, display_name, description_ru, tier, enabled,
   fallback_ids_json, updated_at, updated_by)
VALUES
  ('velora-rocinante', 'Rocinante 12B · Story',
   'Специализированная ролевая модель для живых диалогов, выразительных действий и последовательного голоса персонажа.',
   'standard', 1, '["velora-balanced"]', unixepoch() * 1000, NULL),
  ('velora-deepseek-r1', 'DeepSeek R1 · Director',
   'Продвинутая модель для глубокого характера, причинно-следственного сюжета, интриг и длинных ролевых сцен.',
   'premium', 1, '["velora-balanced"]', unixepoch() * 1000, NULL),
  ('velora-llama-epic', 'Llama 3.3 70B · Epic',
   'Стабильная большая модель для кинематографичных сцен, естественного диалога и взаимодействия нескольких персонажей.',
   'premium', 1, '["velora-balanced"]', unixepoch() * 1000, NULL);
