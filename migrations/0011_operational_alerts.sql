CREATE TABLE operational_alerts (
  id TEXT PRIMARY KEY,
  alert_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('WARNING', 'CRITICAL')),
  state TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'RESOLVED')),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 240),
  details_json TEXT NOT NULL DEFAULT '{}',
  occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_detected_at INTEGER NOT NULL,
  last_detected_at INTEGER NOT NULL,
  last_notified_at INTEGER,
  notification_lease_until INTEGER,
  resolved_at INTEGER,
  resolution_notified_at INTEGER
) STRICT;

CREATE UNIQUE INDEX idx_operational_alert_open_key
  ON operational_alerts(alert_key) WHERE state = 'OPEN';
CREATE INDEX idx_operational_alert_state_time
  ON operational_alerts(state, last_detected_at DESC);
