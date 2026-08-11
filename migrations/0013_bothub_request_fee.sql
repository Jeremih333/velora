-- BotHub's public API catalogue charges a fixed amount per LLM request in
-- addition to token usage. Reserve a conservative USD-equivalent ceiling for
-- that fee so a successful request cannot bypass application spend controls.
UPDATE model_profiles
SET cost_policy_json = CASE name
      WHEN 'BALANCED' THEN '{"maxInputUsdPerMillion":0.65,"maxOutputUsdPerMillion":1.95,"fixedRequestUsd":0.02}'
      WHEN 'CREATIVE' THEN '{"maxInputUsdPerMillion":0.50,"maxOutputUsdPerMillion":4.20,"fixedRequestUsd":0.02}'
      WHEN 'PREMIUM' THEN '{"maxInputUsdPerMillion":1.65,"maxOutputUsdPerMillion":8.30,"fixedRequestUsd":0.02}'
      ELSE cost_policy_json
    END,
    fallback_models_json = CASE name
      WHEN 'BALANCED' THEN '[]'
      WHEN 'CREATIVE' THEN '[{"provider":"BOTHUB","model":"deepseek-v3.2-speciale","maxInputUsdPerMillion":0.65,"maxOutputUsdPerMillion":1.95,"fixedRequestUsd":0.02}]'
      WHEN 'PREMIUM' THEN '[{"provider":"BOTHUB","model":"gemini-2.5-flash","maxInputUsdPerMillion":0.50,"maxOutputUsdPerMillion":4.20,"fixedRequestUsd":0.02},{"provider":"BOTHUB","model":"deepseek-v3.2-speciale","maxInputUsdPerMillion":0.65,"maxOutputUsdPerMillion":1.95,"fixedRequestUsd":0.02}]'
      ELSE fallback_models_json
    END,
    updated_at = unixepoch() * 1000
WHERE name IN ('BALANCED', 'CREATIVE', 'PREMIUM');
