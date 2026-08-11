-- Keep every roleplay profile on a model proven present in the authenticated BotHub catalogue.
-- Deployment remains fail-closed through PAID_AI_ENABLED=false until the owner-approved V3 smoke
-- and accounting reconciliation succeed.
UPDATE model_profiles
SET provider = 'BOTHUB',
    model = 'deepseek-chat-v3.1',
    cost_policy_json =
      '{"maxInputUsdPerMillion":0.41,"maxOutputUsdPerMillion":1.55,"fixedRequestUsd":0.02}',
    fallback_models_json = '[]',
    updated_at = unixepoch() * 1000
WHERE name IN ('BALANCED', 'CREATIVE', 'PREMIUM');
