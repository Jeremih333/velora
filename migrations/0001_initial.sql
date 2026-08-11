PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  display_name TEXT NOT NULL,
  avatar_file_id TEXT,
  locale TEXT NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru', 'en')),
  role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'CREATOR', 'MODERATOR', 'SENIOR_MODERATOR', 'ADMIN', 'OWNER')),
  age_gate_accepted_at INTEGER,
  moderation_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (moderation_state IN ('ACTIVE', 'RESTRICTED', 'SUSPENDED', 'BANNED')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;
CREATE INDEX idx_users_moderation ON users(moderation_state, deleted_at);

CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'amoled', 'light')),
  default_persona_id TEXT,
  generation_profile TEXT NOT NULL DEFAULT 'BALANCED' CHECK (generation_profile IN ('BALANCED', 'CREATIVE', 'PREMIUM')),
  nsfw_visible INTEGER NOT NULL DEFAULT 0 CHECK (nsfw_visible IN (0, 1)),
  preferences_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
) STRICT;
CREATE INDEX idx_sessions_user ON sessions(user_id, expires_at);

CREATE TABLE auth_nonces (
  init_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_auth_nonces_expiry ON auth_nonces(expires_at);

CREATE TABLE telegram_updates (
  update_id INTEGER PRIMARY KEY,
  update_type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT
) STRICT;

CREATE TABLE file_objects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('TELEGRAM', 'R2')),
  provider_file_id TEXT NOT NULL,
  provider_unique_id TEXT,
  object_key TEXT,
  mime_type TEXT NOT NULL,
  original_name TEXT,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER,
  height INTEGER,
  moderation_state TEXT NOT NULL DEFAULT 'PENDING' CHECK (moderation_state IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE(storage_provider, provider_file_id)
) STRICT;
CREATE INDEX idx_file_objects_owner ON file_objects(owner_id, deleted_at);

CREATE TABLE personas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  avatar_file_id TEXT REFERENCES file_objects(id),
  short_description TEXT NOT NULL DEFAULT '',
  long_description TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  appearance TEXT NOT NULL DEFAULT '',
  speaking_style TEXT NOT NULL DEFAULT '',
  background TEXT NOT NULL DEFAULT '',
  pronouns TEXT NOT NULL DEFAULT '',
  represented_age TEXT,
  custom_notes TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;
CREATE INDEX idx_personas_user ON personas(user_id, deleted_at);
CREATE UNIQUE INDEX idx_personas_one_default ON personas(user_id) WHERE is_default = 1 AND deleted_at IS NULL;

CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_version_id TEXT,
  avatar_file_id TEXT REFERENCES file_objects(id),
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PUBLIC', 'UNLISTED', 'PRIVATE', 'MODERATION_HIDDEN', 'DELETED')),
  publish_state TEXT NOT NULL DEFAULT 'DRAFT' CHECK (publish_state IN ('DRAFT', 'MODERATION_PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN')),
  content_rating TEXT NOT NULL DEFAULT 'SAFE' CHECK (content_rating IN ('SAFE', 'MATURE')),
  language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('ru', 'en')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  deleted_at INTEGER
) STRICT;
CREATE INDEX idx_characters_owner ON characters(owner_id, deleted_at);
CREATE INDEX idx_characters_discovery ON characters(publish_state, visibility, updated_at DESC);

CREATE TABLE character_versions (
  id TEXT PRIMARY KEY,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  personality TEXT NOT NULL,
  scenario TEXT NOT NULL DEFAULT '',
  first_message TEXT NOT NULL,
  example_dialogues TEXT NOT NULL DEFAULT '',
  creator_notes TEXT NOT NULL DEFAULT '',
  speech_style TEXT NOT NULL DEFAULT '',
  appearance TEXT NOT NULL DEFAULT '',
  background TEXT NOT NULL DEFAULT '',
  goals TEXT NOT NULL DEFAULT '',
  behaviour_rules TEXT NOT NULL DEFAULT '',
  system_instructions TEXT NOT NULL DEFAULT '',
  post_history_instructions TEXT NOT NULL DEFAULT '',
  alternate_greetings_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  UNIQUE(character_id, version)
) STRICT;
CREATE INDEX idx_character_versions_character ON character_versions(character_id, version DESC);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  content_rating TEXT NOT NULL DEFAULT 'SAFE' CHECK (content_rating IN ('SAFE', 'MATURE')),
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE character_tags (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY(character_id, tag_id)
) WITHOUT ROWID;
CREATE INDEX idx_character_tags_tag ON character_tags(tag_id, character_id);

CREATE TABLE character_likes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, character_id)
) WITHOUT ROWID;
CREATE INDEX idx_character_likes_character ON character_likes(character_id, created_at);

CREATE TABLE character_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, character_id)
) WITHOUT ROWID;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id),
  character_version_id TEXT NOT NULL REFERENCES character_versions(id),
  persona_id TEXT REFERENCES personas(id),
  persona_snapshot_json TEXT,
  title TEXT NOT NULL,
  active_message_id TEXT,
  state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
  memory_stale INTEGER NOT NULL DEFAULT 0 CHECK (memory_stale IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;
CREATE INDEX idx_conversations_user ON conversations(user_id, updated_at DESC);

CREATE TABLE conversation_settings (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  model_profile TEXT NOT NULL DEFAULT 'BALANCED' CHECK (model_profile IN ('BALANCED', 'CREATIVE', 'PREMIUM')),
  temperature REAL NOT NULL DEFAULT 0.9 CHECK (temperature BETWEEN 0 AND 2),
  max_output_tokens INTEGER NOT NULL DEFAULT 800 CHECK (max_output_tokens BETWEEN 64 AND 8192),
  response_length TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (response_length IN ('SHORT', 'MEDIUM', 'LONG')),
  custom_instructions TEXT NOT NULL DEFAULT '',
  persona_mode TEXT NOT NULL DEFAULT 'SNAPSHOT' CHECK (persona_mode IN ('SNAPSHOT', 'LIVE')),
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM_INTERNAL')),
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'STREAMING', 'COMPLETED', 'STOPPED', 'FAILED', 'MODERATED')),
  parent_message_id TEXT REFERENCES messages(id),
  generation_group_id TEXT,
  model TEXT,
  provider TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER
) STRICT;
CREATE INDEX idx_messages_branch ON messages(conversation_id, parent_message_id, created_at);
CREATE INDEX idx_messages_generation ON messages(generation_group_id);

CREATE TABLE message_generations (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  request_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  response_message_id TEXT REFERENCES messages(id),
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'STREAMING', 'COMPLETED', 'STOPPED', 'FAILED')),
  attempt INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_code TEXT,
  UNIQUE(conversation_id, idempotency_key)
) STRICT;

CREATE TABLE generation_locks (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  generation_id TEXT NOT NULL REFERENCES message_generations(id) ON DELETE CASCADE,
  acquired_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE TABLE conversation_memory (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  active_version_id TEXT,
  last_summarized_message_id TEXT REFERENCES messages(id),
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE memory_versions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('AUTO_SUMMARY', 'FULL_REGENERATION', 'MANUAL_EDIT', 'RESTORE')),
  from_message_id TEXT REFERENCES messages(id),
  to_message_id TEXT REFERENCES messages(id),
  created_at INTEGER NOT NULL,
  created_by TEXT REFERENCES users(id),
  model TEXT,
  previous_version_id TEXT REFERENCES memory_versions(id)
) STRICT;
CREATE INDEX idx_memory_versions_conversation ON memory_versions(conversation_id, created_at DESC);

CREATE TABLE lorebooks (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PUBLIC', 'UNLISTED', 'PRIVATE')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;

CREATE TABLE lorebook_entries (
  id TEXT PRIMARY KEY,
  lorebook_id TEXT NOT NULL REFERENCES lorebooks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keys_json TEXT NOT NULL,
  secondary_keys_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  priority INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  case_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (case_sensitive IN (0, 1)),
  match_whole_word INTEGER NOT NULL DEFAULT 0 CHECK (match_whole_word IN (0, 1)),
  scan_depth INTEGER NOT NULL DEFAULT 20 CHECK (scan_depth BETWEEN 1 AND 200),
  token_budget INTEGER NOT NULL DEFAULT 400 CHECK (token_budget BETWEEN 1 AND 8192),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_lore_entries_book ON lorebook_entries(lorebook_id, enabled, priority DESC);

CREATE TABLE character_lorebooks (
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  lorebook_id TEXT NOT NULL REFERENCES lorebooks(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY(character_id, lorebook_id)
) WITHOUT ROWID;

CREATE TABLE conversation_lorebooks (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  lorebook_id TEXT NOT NULL REFERENCES lorebooks(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  PRIMARY KEY(conversation_id, lorebook_id)
) WITHOUT ROWID;

CREATE TABLE model_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature REAL NOT NULL,
  top_p REAL NOT NULL,
  max_output_tokens INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  fallback_models_json TEXT NOT NULL DEFAULT '[]',
  cost_policy_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE ai_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  generation_id TEXT REFERENCES message_generations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('ROLEPLAY', 'MEMORY', 'MODERATION')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_micros INTEGER NOT NULL DEFAULT 0,
  actual_cost_micros INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('RESERVED', 'STREAMING', 'COMPLETED', 'FAILED', 'REFUNDED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_code TEXT
) STRICT;
CREATE INDEX idx_ai_requests_budget ON ai_requests(purpose, created_at, status);
CREATE INDEX idx_ai_requests_user ON ai_requests(user_id, created_at DESC);

CREATE TABLE usage_daily (
  usage_date TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_micros INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(usage_date, user_id, purpose)
) WITHOUT ROWID;

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE plan_entitlements (
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  entitlement TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY(plan_id, entitlement)
) WITHOUT ROWID;

CREATE TABLE user_entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  expires_at INTEGER,
  revoked_at INTEGER,
  UNIQUE(user_id, entitlement, source_type, source_id)
) STRICT;
CREATE INDEX idx_user_entitlements_active ON user_entitlements(user_id, entitlement, expires_at, revoked_at);

CREATE TABLE credit_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency TEXT NOT NULL DEFAULT 'CREDIT_MICRO' CHECK (currency = 'CREDIT_MICRO'),
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE credit_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('PURCHASE', 'BONUS', 'PROMOTION', 'ADMIN_GRANT', 'GENERATION_USAGE', 'REFUND', 'REVERSAL', 'EXPIRATION')),
  amount_micros INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  reference_type TEXT,
  reference_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_credit_transactions_user ON credit_transactions(user_id, created_at);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'TELEGRAM_STARS' CHECK (provider = 'TELEGRAM_STARS'),
  currency TEXT NOT NULL DEFAULT 'XTR' CHECK (currency = 'XTR'),
  amount INTEGER NOT NULL CHECK (amount > 0),
  state TEXT NOT NULL CHECK (state IN ('CREATED', 'INVOICE_SENT', 'PENDING', 'PAID', 'ENTITLEMENT_GRANTED', 'CANCELLED', 'FAILED', 'EXPIRED', 'REFUNDED')),
  invoice_payload TEXT NOT NULL UNIQUE,
  telegram_payment_charge_id TEXT UNIQUE,
  provider_payment_charge_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  paid_at INTEGER
) STRICT;
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('CHARACTER', 'AVATAR', 'CREATOR', 'GENERATED_MESSAGE', 'USER_PROFILE')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE moderation_cases (
  id TEXT PRIMARY KEY,
  report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'TRIAGED', 'IN_REVIEW', 'RESOLVED', 'APPEALED', 'APPEAL_REVIEW', 'CLOSED')),
  assigned_to TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER
) STRICT;
CREATE INDEX idx_moderation_queue ON moderation_cases(state, priority DESC, created_at);

CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('NO_ACTION', 'WARNING', 'CONTENT_HIDE', 'CONTENT_REMOVE', 'TEMP_RESTRICTION', 'ACCOUNT_SUSPEND', 'ACCOUNT_BAN', 'ESCALATE')),
  reason TEXT NOT NULL,
  previous_state_json TEXT NOT NULL,
  new_state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE appeals (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'UPHELD', 'OVERTURNED', 'CLOSED')),
  reviewer_id TEXT REFERENCES users(id),
  decision TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
) STRICT;

CREATE TABLE feature_flags (
  key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  rollout_percent INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  updated_by TEXT REFERENCES users(id)
) STRICT;

CREATE TABLE idempotency_keys (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER,
  response_json TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(scope, key)
) WITHOUT ROWID;
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD')),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at INTEGER NOT NULL,
  lease_expires_at INTEGER,
  last_error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_jobs_claim ON jobs(status, available_at, lease_expires_at);

CREATE TABLE budget_periods (
  period_type TEXT NOT NULL CHECK (period_type IN ('DAY', 'MONTH', 'LIFETIME')),
  period_key TEXT NOT NULL,
  limit_micros INTEGER NOT NULL CHECK (limit_micros >= 0),
  reserved_micros INTEGER NOT NULL DEFAULT 0 CHECK (reserved_micros >= 0),
  spent_micros INTEGER NOT NULL DEFAULT 0 CHECK (spent_micros >= 0),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(period_type, period_key)
) WITHOUT ROWID;

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  request_id TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_audit_target ON audit_logs(target_type, target_id, created_at DESC);

INSERT INTO plans (id, code, display_name, active, created_at, updated_at)
VALUES ('plan-free', 'FREE', 'Free', 1, unixepoch() * 1000, unixepoch() * 1000);

INSERT INTO model_profiles (id, name, provider, model, temperature, top_p, max_output_tokens, timeout_ms, fallback_models_json, cost_policy_json, enabled, updated_at)
VALUES
  ('model-balanced', 'BALANCED', 'OPENROUTER', 'deepseek/deepseek-v3.2', 0.9, 0.95, 800, 90000, '["thedrummer/cydonia-24b-v4.1"]', '{"maxInputUsdPerMillion":0.30,"maxOutputUsdPerMillion":0.50}', 1, unixepoch() * 1000),
  ('model-creative', 'CREATIVE', 'OPENROUTER', 'thedrummer/cydonia-24b-v4.1', 1.0, 0.95, 1000, 90000, '["deepseek/deepseek-v3.2"]', '{"maxInputUsdPerMillion":0.35,"maxOutputUsdPerMillion":0.60}', 1, unixepoch() * 1000),
  ('model-premium', 'PREMIUM', 'OPENROUTER', 'aion-labs/aion-3.0-mini', 0.95, 0.95, 1200, 120000, '["thedrummer/cydonia-24b-v4.1","deepseek/deepseek-v3.2"]', '{"maxInputUsdPerMillion":0.80,"maxOutputUsdPerMillion":1.60}', 1, unixepoch() * 1000);
