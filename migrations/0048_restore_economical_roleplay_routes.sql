-- Immutable migration: restore the reviewed low-cost BotHub routes after the
-- current key-scoped provider catalog confirmed both models are available again.
UPDATE roleplay_model_overrides
SET display_name = 'Lunaris Roleplay',
    description_ru = 'Очень экономичная ролевая модель для коротких и средних сцен. Память VeloraAI помогает сохранять важный контекст истории.',
    tier = 'free',
    enabled = 1,
    fallback_ids_json = '[]',
    updated_at = unixepoch() * 1000,
    updated_by = NULL
WHERE model_profile_id = 'velora-free-roleplay';

UPDATE roleplay_model_overrides
SET display_name = 'Mistral Nemo',
    description_ru = 'Экономичная мультиязычная модель с большим контекстом для знакомства с приложением и историй средней сложности.',
    tier = 'free',
    enabled = 1,
    fallback_ids_json = '["velora-free-roleplay"]',
    updated_at = unixepoch() * 1000,
    updated_by = NULL
WHERE model_profile_id = 'velora-free-context';
