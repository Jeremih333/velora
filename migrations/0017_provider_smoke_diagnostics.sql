-- Preserve V1 evidence and add privacy-safe protocol diagnostics for separately consented runs.
-- Provider response bodies, prompts and generated text remain deliberately absent.
ALTER TABLE provider_smoke_runs
  ADD COLUMN protocol_variant TEXT NOT NULL DEFAULT 'OPENAI_INCLUDE_USAGE'
  CHECK (protocol_variant IN ('OPENAI_INCLUDE_USAGE', 'BOTHUB_DOCUMENTED'));

ALTER TABLE provider_smoke_runs
  ADD COLUMN http_status INTEGER
  CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599);

ALTER TABLE provider_smoke_runs
  ADD COLUMN response_started INTEGER NOT NULL DEFAULT 0
  CHECK (response_started IN (0, 1));
