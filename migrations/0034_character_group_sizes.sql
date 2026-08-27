-- Additive discovery metadata and a deterministic rollout switch for the group-size filter.
ALTER TABLE characters ADD COLUMN group_size TEXT NOT NULL DEFAULT 'single';

CREATE INDEX idx_characters_discovery_group_size
  ON characters(publish_state, visibility, group_size, updated_at, id)
  WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO feature_flags
  (key, enabled, rollout_percent, config_json, updated_at, updated_by)
VALUES ('groups', 1, 100, '{}', 0, NULL);
