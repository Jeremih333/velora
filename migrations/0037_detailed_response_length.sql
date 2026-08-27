CREATE TABLE conversation_settings_v2 (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  model_profile TEXT NOT NULL DEFAULT 'BALANCED' CHECK (model_profile IN ('BALANCED', 'CREATIVE', 'PREMIUM')),
  temperature REAL NOT NULL DEFAULT 0.9 CHECK (temperature BETWEEN 0 AND 2),
  max_output_tokens INTEGER NOT NULL DEFAULT 800 CHECK (max_output_tokens BETWEEN 64 AND 8192),
  response_length TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (response_length IN ('SHORT', 'MEDIUM', 'DETAILED', 'LONG')),
  custom_instructions TEXT NOT NULL DEFAULT '',
  persona_mode TEXT NOT NULL DEFAULT 'SNAPSHOT' CHECK (persona_mode IN ('SNAPSHOT', 'LIVE')),
  updated_at INTEGER NOT NULL,
  model_profile_id TEXT NOT NULL DEFAULT 'velora-balanced'
) STRICT;

INSERT INTO conversation_settings_v2 (
  conversation_id, model_profile, temperature, max_output_tokens, response_length,
  custom_instructions, persona_mode, updated_at, model_profile_id
)
SELECT
  conversation_id, model_profile, temperature, max_output_tokens, response_length,
  custom_instructions, persona_mode, updated_at, model_profile_id
FROM conversation_settings;

DROP TABLE conversation_settings;
ALTER TABLE conversation_settings_v2 RENAME TO conversation_settings;

CREATE INDEX idx_conversation_settings_model_profile_id
  ON conversation_settings(model_profile_id);
