-- Immutable migration: every reviewed roleplay profile must have an owner-editable row.
-- Provider IDs, prices and context limits remain in the immutable server registry.
INSERT OR IGNORE INTO roleplay_model_overrides
  (model_profile_id, display_name, description_ru, tier, enabled,
   fallback_ids_json, updated_at, updated_by)
VALUES
  ('velora-qwen-story', 'Qwen3 8B · Story',
   'Быстрая многоязычная модель для динамичных диалогов, коротких сцен и экспериментов с голосом персонажа.',
   'standard', 1, '["velora-balanced"]', unixepoch() * 1000, NULL),
  ('velora-chimera', 'DeepSeek Chimera · Plot',
   'Продвинутая модель для сложных сюжетных связей, конфликтов и последовательного развития мира.',
   'premium', 1, '["velora-balanced"]', unixepoch() * 1000, NULL),
  ('velora-kimi-epic', 'Kimi K2.5 · Epic',
   'Модель для длинных кинематографичных сцен и взаимодействия нескольких персонажей.',
   'premium', 1, '["velora-balanced"]', unixepoch() * 1000, NULL);
