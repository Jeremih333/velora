-- Switch the prepaid roleplay gateway without mutating already-applied migrations.
-- Prices remain conservative USD-equivalent safety ceilings until a live BotHub
-- usage/balance reconciliation is completed by the owner checkpoint.
UPDATE model_profiles
SET provider = 'BOTHUB',
    model = CASE name
      WHEN 'BALANCED' THEN 'deepseek-v3.2-speciale'
      WHEN 'CREATIVE' THEN 'gemini-2.5-flash'
      WHEN 'PREMIUM' THEN 'claude-haiku-4.5'
      ELSE model
    END,
    fallback_models_json = '[]',
    cost_policy_json = CASE name
      WHEN 'BALANCED' THEN '{"maxInputUsdPerMillion":0.65,"maxOutputUsdPerMillion":1.95}'
      WHEN 'CREATIVE' THEN '{"maxInputUsdPerMillion":0.50,"maxOutputUsdPerMillion":4.20}'
      WHEN 'PREMIUM' THEN '{"maxInputUsdPerMillion":1.65,"maxOutputUsdPerMillion":8.30}'
      ELSE cost_policy_json
    END,
    updated_at = unixepoch() * 1000
WHERE name IN ('BALANCED', 'CREATIVE', 'PREMIUM');
