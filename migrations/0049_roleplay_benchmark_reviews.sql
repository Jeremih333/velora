-- Immutable migration: privacy-preserving evidence and owner scores for the standardized
-- roleplay benchmark. Generated prose is deliberately never stored.
CREATE TABLE roleplay_benchmark_runs (
  run_key TEXT PRIMARY KEY CHECK (length(run_key) BETWEEN 1 AND 100),
  benchmark_version TEXT NOT NULL CHECK (length(benchmark_version) BETWEEN 1 AND 32),
  model_profile_id TEXT NOT NULL CHECK (length(model_profile_id) BETWEEN 1 AND 80),
  provider_model_id TEXT NOT NULL CHECK (length(provider_model_id) BETWEEN 1 AND 128),
  state TEXT NOT NULL CHECK (
    state IN ('RUNNING', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'FAILED')
  ),
  actor_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 1 AND 128),
  scenario_count INTEGER NOT NULL CHECK (scenario_count BETWEEN 1 AND 20),
  completed_scenario_count INTEGER NOT NULL DEFAULT 0 CHECK (
    completed_scenario_count BETWEEN 0 AND scenario_count
  ),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  conservative_cost_micros INTEGER NOT NULL DEFAULT 0 CHECK (conservative_cost_micros >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  scenario_evidence_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(scenario_evidence_json)),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 120),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES users(id),
  CHECK (
    (state IN ('RUNNING', 'FAILED') AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR state = 'AWAITING_REVIEW'
    OR (state IN ('APPROVED', 'REJECTED') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
) STRICT;

CREATE TABLE roleplay_benchmark_scores (
  run_key TEXT NOT NULL REFERENCES roleplay_benchmark_runs(run_key) ON DELETE CASCADE,
  criterion TEXT NOT NULL CHECK (
    criterion IN (
      'character_adherence',
      'persona_adherence',
      'narrative_quality',
      'russian_quality',
      'english_quality',
      'emotional_continuity',
      'memory_use',
      'lore_use',
      'formatting',
      'repetition_control',
      'verbosity_control',
      'latency',
      'cost',
      'consensual_mature_fictional_compatibility'
    )
  ),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  PRIMARY KEY (run_key, criterion)
) WITHOUT ROWID;

CREATE INDEX roleplay_benchmark_runs_model_idx
  ON roleplay_benchmark_runs(model_profile_id, started_at DESC);
