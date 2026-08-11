-- Bounded BotHub fallback chains. Every fallback has an explicit conservative
-- retail ceiling so the Worker can reserve the maximum possible request cost
-- before contacting the provider.
UPDATE model_profiles
SET fallback_models_json = CASE name
  WHEN 'BALANCED' THEN '[]'
  WHEN 'CREATIVE' THEN '[{"provider":"BOTHUB","model":"deepseek-v3.2-speciale","maxInputUsdPerMillion":0.65,"maxOutputUsdPerMillion":1.95}]'
  WHEN 'PREMIUM' THEN '[{"provider":"BOTHUB","model":"gemini-2.5-flash","maxInputUsdPerMillion":0.50,"maxOutputUsdPerMillion":4.20},{"provider":"BOTHUB","model":"deepseek-v3.2-speciale","maxInputUsdPerMillion":0.65,"maxOutputUsdPerMillion":1.95}]'
  ELSE fallback_models_json
END,
updated_at = unixepoch() * 1000
WHERE name IN ('BALANCED', 'CREATIVE', 'PREMIUM');
