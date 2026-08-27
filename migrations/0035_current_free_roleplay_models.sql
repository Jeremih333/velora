-- Immutable migration: align owner-editable labels with the current key-scoped BotHub Free routes.
-- Provider IDs and prices remain in the reviewed server registry, never in mutable D1 config.
UPDATE roleplay_model_overrides
SET display_name = 'Qwen Roleplay',
    description_ru = 'Экономичная мультиязычная модель для быстрых ролевых сцен и знакомства с возможностями VeloraAI.',
    tier = 'free',
    enabled = 1,
    fallback_ids_json = '[]',
    updated_at = unixepoch() * 1000,
    updated_by = NULL
WHERE model_profile_id = 'velora-free-roleplay';

UPDATE roleplay_model_overrides
SET display_name = 'VeloraAI Nano',
    description_ru = 'Экономичная модель с большим контекстом для знакомства с приложением и простых ролевых сцен.',
    tier = 'free',
    enabled = 1,
    fallback_ids_json = '["velora-free-roleplay"]',
    updated_at = unixepoch() * 1000,
    updated_by = NULL
WHERE model_profile_id = 'velora-free-context';
