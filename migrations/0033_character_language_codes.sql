-- Additive language expansion. The legacy `language` column has a historical ru/en CHECK and is
-- retained so this migration never rebuilds or drops the parent table referenced by live data.
ALTER TABLE characters ADD COLUMN language_code TEXT NOT NULL DEFAULT 'ru';

UPDATE characters SET language_code = language;

CREATE INDEX idx_characters_discovery_language
  ON characters(publish_state, visibility, language_code, updated_at, id)
  WHERE deleted_at IS NULL;
