-- Persist only the intersection between the provider catalogue and reviewed roleplay candidates.
-- The full key-scoped provider response and API key are never stored.
CREATE TABLE provider_model_capabilities (
  provider TEXT PRIMARY KEY CHECK (provider = 'BOTHUB'),
  catalog_sha256 TEXT NOT NULL CHECK (length(catalog_sha256) = 64),
  available_candidates_json TEXT NOT NULL
    CHECK (json_valid(available_candidates_json) AND length(available_candidates_json) <= 2048),
  selected_model TEXT CHECK (selected_model IS NULL OR length(selected_model) BETWEEN 1 AND 128),
  checked_at INTEGER NOT NULL
) WITHOUT ROWID;
