-- Immutable migration: owner-managed display/routing overrides for reviewed roleplay models.
-- Provider IDs, prices and context limits remain in the server allowlist and cannot be changed here.
ALTER TABLE ai_requests ADD COLUMN first_token_latency_ms INTEGER
  CHECK (first_token_latency_ms IS NULL OR first_token_latency_ms >= 0);

CREATE TABLE roleplay_model_overrides (
  model_profile_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  description_ru TEXT NOT NULL CHECK (length(description_ru) BETWEEN 1 AND 1000),
  tier TEXT NOT NULL CHECK (tier IN ('free', 'standard', 'premium')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  fallback_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fallback_ids_json)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(id)
) STRICT;

INSERT INTO roleplay_model_overrides
  (model_profile_id, display_name, description_ru, tier, enabled,
   fallback_ids_json, updated_at, updated_by)
VALUES
  ('velora-balanced', 'Velora Balanced',
   'Проверенная модель для длинных ролевых историй, последовательных персонажей и повседневных диалогов.',
   'standard', 1, '[]', unixepoch() * 1000, NULL),
  ('velora-free-roleplay', 'Lunaris Roleplay',
   'Очень экономичная ролевая модель для коротких и средних сцен. Небольшое контекстное окно сильнее опирается на память Velora.',
   'free', 1, '[]', unixepoch() * 1000, NULL),
  ('velora-free-context', 'Mistral Nemo',
   'Экономичная универсальная модель с большим окном контекста. Подходит для знакомства с Velora и историй средней сложности.',
   'free', 1, '["velora-free-roleplay"]', unixepoch() * 1000, NULL);

CREATE TABLE roleplay_model_default (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  model_profile_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(id)
) STRICT;

INSERT INTO roleplay_model_default
  (singleton, model_profile_id, updated_at, updated_by)
VALUES (1, 'velora-balanced', unixepoch() * 1000, NULL);
