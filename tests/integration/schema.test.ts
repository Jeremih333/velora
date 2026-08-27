import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('initial schema contract', () => {
  it('accounts AvatarBot usage by the interacting Telegram user', async () => {
    const sql = await readFile(
      new URL('../../migrations/0060_avatar_bot_actor_budget.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('actor_telegram_id TEXT');
    expect(sql).toContain('idx_character_bot_ai_actor_daily');
  });

  it('contains every required source-of-truth aggregate and no RoleMate binding', async () => {
    const sql = await readFile(
      new URL('../../migrations/0001_initial.sql', import.meta.url),
      'utf8',
    );
    for (const table of [
      'users',
      'personas',
      'characters',
      'character_versions',
      'conversations',
      'messages',
      'conversation_memory',
      'memory_versions',
      'lorebooks',
      'lorebook_entries',
      'ai_requests',
      'credit_transactions',
      'payments',
      'reports',
      'moderation_cases',
      'audit_logs',
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
    expect(sql.toLowerCase()).not.toContain('rolemate');
  });

  it('stores contextual risk signals without an automatic-sanction column', async () => {
    const sql = await readFile(
      new URL('../../migrations/0004_moderation_risk_signals.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE risk_signals');
    expect(sql).toContain('subject_user_id');
    expect(sql).not.toMatch(/ban|suspend/iu);
  });

  it('keeps Stars packs configurable and has no default price invented in migration', async () => {
    const sql = await readFile(
      new URL('../../migrations/0005_one_time_stars_billing.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE credit_packs');
    expect(sql).toContain('client_idempotency_key');
    expect(sql).not.toMatch(/INSERT\s+INTO\s+credit_packs/iu);
    expect(sql).not.toMatch(/subscription|recurring|card/iu);
  });

  it('enforces one review per user and bounded ratings at the D1 layer', async () => {
    const sql = await readFile(
      new URL('../../migrations/0006_character_reviews.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('PRIMARY KEY(user_id, character_id)');
    expect(sql).toContain('CHECK (rating BETWEEN 1 AND 5)');
    expect(sql).toContain('CHECK (length(review_text) <= 1000)');
  });

  it('keeps reliability controls privacy-bounded and Free-tier compatible', async () => {
    const sql = await readFile(
      new URL('../../migrations/0007_reliability_controls.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE api_rate_limits');
    expect(sql).toContain('CREATE TABLE product_events');
    expect(sql).toContain('source_key TEXT UNIQUE');
    expect(sql).toContain("'MESSAGE_SENT'");
    expect(sql).not.toMatch(/message_content|prompt|response_text/iu);
    expect(sql).not.toMatch(/CREATE TABLE.*(queue|redis|r2)/iu);
  });

  it('enforces bidirectional-safe blocking and cancellable account deletion contracts', async () => {
    const sql = await readFile(
      new URL('../../migrations/0008_account_controls.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE user_blocks');
    expect(sql).toContain('CHECK (blocker_id != blocked_user_id)');
    expect(sql).toContain('PRIMARY KEY(blocker_id, blocked_user_id)');
    expect(sql).toContain('CREATE TABLE account_deletion_requests');
    expect(sql).toContain("'PENDING', 'PROCESSING', 'CANCELLED', 'COMPLETED', 'FAILED'");
    expect(sql).toContain('attempts BETWEEN 0 AND 5');
    expect(sql).toContain('retention_json');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('switches roleplay profiles to BotHub without mutating the initial migration', async () => {
    const sql = await readFile(
      new URL('../../migrations/0009_bothub_model_profiles.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("SET provider = 'BOTHUB'");
    expect(sql).toContain("'deepseek-v3.2-speciale'");
    expect(sql).toContain("'gemini-2.5-flash'");
    expect(sql).toContain("'claude-haiku-4.5'");
    expect(sql).toContain("fallback_models_json = '[]'");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('adds only bounded, explicitly priced roleplay fallbacks', async () => {
    const sql = await readFile(
      new URL('../../migrations/0012_generation_fallbacks.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("WHEN 'BALANCED' THEN '[]'");
    expect(sql).toContain('deepseek-v3.2-speciale');
    expect(sql).toContain('gemini-2.5-flash');
    expect(sql).toContain('maxInputUsdPerMillion');
    expect(sql).toContain('maxOutputUsdPerMillion');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('adds the fixed BotHub request fee to every roleplay candidate', async () => {
    const sql = await readFile(
      new URL('../../migrations/0013_bothub_request_fee.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('fixedRequestUsd');
    expect(sql.match(/fixedRequestUsd/g)).toHaveLength(6);
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('separates provider retry spend from user-billable generation cost', async () => {
    const sql = await readFile(
      new URL('../../migrations/0014_provider_spend_accounting.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('provider_estimated_cost_micros');
    expect(sql).toContain('provider_actual_cost_micros');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('stores only bounded Telegram reconciliation state and no secrets', async () => {
    const sql = await readFile(
      new URL('../../migrations/0015_integration_reconciliation.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE integration_reconciliations');
    expect(sql).toContain("'APPLYING', 'READY', 'FAILED'");
    expect(sql).toContain('attempts BETWEEN 0 AND 10');
    expect(sql).not.toMatch(/bot_token|webhook_secret|DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('stores one bounded reaction per user and concrete message generation', async () => {
    const sql = await readFile(
      new URL('../../migrations/0032_message_generation_reactions.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE message_generation_reactions');
    expect(sql).toContain('REFERENCES message_generations(id) ON DELETE CASCADE');
    expect(sql).toContain("reaction IN ('POSITIVE', 'NEGATIVE', 'EXCEPTIONAL')");
    expect(sql).toContain('PRIMARY KEY(generation_id, user_id)');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('records one bounded provider smoke without persisting prompts or generated text', async () => {
    const sql = await readFile(
      new URL('../../migrations/0016_provider_smoke_runs.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE provider_smoke_runs');
    expect(sql).toContain("state IN ('RUNNING', 'COMPLETED', 'FAILED')");
    expect(sql).toContain('provider_reported_cost_micros');
    expect(sql).toContain('output_sha256');
    expect(sql).not.toMatch(/\b(?:prompt|output_text|api_key)\s+TEXT|DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('adds bounded provider diagnostics without storing upstream response bodies', async () => {
    const sql = await readFile(
      new URL('../../migrations/0017_provider_smoke_diagnostics.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("'OPENAI_INCLUDE_USAGE', 'BOTHUB_DOCUMENTED'");
    expect(sql).toContain('http_status BETWEEN 100 AND 599');
    expect(sql).toContain('response_started IN (0, 1)');
    expect(sql).not.toMatch(
      /\b(?:response_body|error_detail|prompt|generated_text)\s+TEXT|DROP\s+TABLE|DELETE\s+FROM/iu,
    );
  });

  it('stores only the reviewed BotHub capability intersection', async () => {
    const sql = await readFile(
      new URL('../../migrations/0018_provider_model_capabilities.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE provider_model_capabilities');
    expect(sql).toContain('available_candidates_json');
    expect(sql).toContain('catalog_sha256');
    expect(sql).toContain('json_valid(available_candidates_json)');
    expect(sql).not.toMatch(
      /\b(?:catalog_response|response_body|api_key|authorization)\s+TEXT|DROP\s+TABLE|DELETE\s+FROM/iu,
    );
  });

  it('routes gated roleplay profiles only through the selected available model', async () => {
    const sql = await readFile(
      new URL('../../migrations/0019_available_roleplay_model.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("model = 'deepseek-chat-v3.1'");
    expect(sql).toContain('"maxInputUsdPerMillion":0.41');
    expect(sql).toContain('"maxOutputUsdPerMillion":1.55');
    expect(sql).toContain("fallback_models_json = '[]'");
    expect(sql).toContain('PAID_AI_ENABLED=false');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('deduplicates only active system-created Mature character reviews', async () => {
    const sql = await readFile(
      new URL('../../migrations/0020_mature_character_review.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE UNIQUE INDEX idx_moderation_cases_active_system_character');
    expect(sql).toContain("target_type = 'CHARACTER'");
    expect(sql).toContain('report_id IS NULL');
    expect(sql).toContain("state IN ('OPEN', 'TRIAGED', 'IN_REVIEW')");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('deduplicates only active system-created avatar reviews', async () => {
    const sql = await readFile(
      new URL('../../migrations/0028_avatar_moderation_queue.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE UNIQUE INDEX idx_moderation_cases_active_system_avatar');
    expect(sql).toContain("target_type = 'AVATAR'");
    expect(sql).toContain('report_id IS NULL');
    expect(sql).toContain("state IN ('OPEN', 'TRIAGED', 'IN_REVIEW')");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('marks private draft-preview conversations without destructive migration steps', async () => {
    const sql = await readFile(
      new URL('../../migrations/0021_preview_conversations.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN is_preview');
    expect(sql).toContain('CHECK (is_preview IN (0, 1))');
    expect(sql).toContain('idx_conversations_user_preview_state');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('stores one privacy-bounded onboarding completion per user', async () => {
    const sql = await readFile(
      new URL('../../migrations/0022_onboarding.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE onboarding_completions');
    expect(sql).toContain('user_id TEXT PRIMARY KEY');
    expect(sql).toContain('idempotency_key TEXT NOT NULL UNIQUE');
    expect(sql).toContain('mature_enabled INTEGER NOT NULL CHECK');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('stores private support requests with bounded categories and states', async () => {
    const sql = await readFile(
      new URL('../../migrations/0023_support_requests.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE support_requests');
    expect(sql).toContain('REFERENCES users(id) ON DELETE CASCADE');
    expect(sql).toContain("'GENERAL', 'TECHNICAL', 'PAYMENT', 'SAFETY', 'DATA'");
    expect(sql).toContain("'OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'");
    expect(sql).toContain('length(message) BETWEEN 20 AND 4000');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('separates product profiles from Telegram identity without destructive changes', async () => {
    const sql = await readFile(
      new URL('../../migrations/0024_user_profiles.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE user_profiles');
    expect(sql).toContain('user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE');
    expect(sql).toContain('avatar_file_id TEXT REFERENCES file_objects(id) ON DELETE SET NULL');
    expect(sql).toContain("visibility IN ('PUBLIC', 'PRIVATE')");
    expect(sql).not.toMatch(/ALTER\s+TABLE\s+users|DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('models one-time plan access without recurring billing or destructive migration steps', async () => {
    const sql = await readFile(
      new URL('../../migrations/0025_nonrenewing_plan_access.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE access_packs');
    expect(sql).toContain('CREATE TABLE plan_access_grants');
    expect(sql).toContain('CREATE TABLE plan_operation_usage');
    expect(sql).toContain("('plan-plus', 'PLUS'");
    expect(sql).toContain("('plan-pro', 'PRO'");
    expect(sql).toContain('source_payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id)');
    expect(sql).toContain('expires_at INTEGER NOT NULL CHECK (expires_at > starts_at)');
    expect(sql).not.toMatch(/subscription|recurring|auto[_ -]?renew|DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('records owner grants separately from real payments and without destructive changes', async () => {
    const sql = await readFile(
      new URL('../../migrations/0026_owner_user_grants.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE admin_user_grants');
    expect(sql).toContain('CREATE TABLE admin_plan_access_grants');
    expect(sql).toContain('idempotency_key TEXT NOT NULL UNIQUE');
    expect(sql).toContain('credit_amount_micros BETWEEN 0 AND 1000000000');
    expect(sql).toContain('source_grant_id TEXT NOT NULL UNIQUE');
    expect(sql).not.toMatch(/INSERT\s+INTO\s+payments|DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('keeps append-only staff appointment history with one active role', async () => {
    const sql = await readFile(
      new URL('../../migrations/0010_staff_assignments.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE staff_assignments');
    expect(sql).toContain("assigned_role IN ('MODERATOR', 'SENIOR_MODERATOR')");
    expect(sql).toContain('WHERE revoked_at IS NULL');
    expect(sql).not.toMatch(/DELETE\s+FROM/iu);
  });

  it('stores deduplicated operational alerts without user content', async () => {
    const sql = await readFile(
      new URL('../../migrations/0011_operational_alerts.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE operational_alerts');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_operational_alert_open_key');
    expect(sql).toContain("WHERE state = 'OPEN'");
    expect(sql).not.toMatch(/message_text|prompt|content_json/iu);
  });

  it('allows the selected BotHub gateway and not the retired provider in static CSP', async () => {
    const headers = await readFile(
      new URL('../../apps/web/public/_headers', import.meta.url),
      'utf8',
    );
    expect(headers).toContain('https://openai.bothub.chat');
    expect(headers.toLowerCase()).not.toContain('openrouter');
  });

  it('adds immutable owner model controls and first-token health telemetry', async () => {
    const sql = await readFile(
      new URL('../../migrations/0030_roleplay_model_admin_controls.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN first_token_latency_ms INTEGER');
    expect(sql).toContain('CREATE TABLE roleplay_model_overrides');
    expect(sql).toContain('CREATE TABLE roleplay_model_default');
    expect(sql).toContain("'velora-free-roleplay'");
    expect(sql).toContain("'velora-free-context'");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('persists server-side mature discovery controls and privacy-safe AI completion metadata', async () => {
    const sql = await readFile(
      new URL('../../migrations/0031_mature_discovery_controls.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN safe_search INTEGER');
    expect(sql).toContain('ADD COLUMN mature_image_blur INTEGER');
    expect(sql).toContain('ADD COLUMN finish_reason TEXT');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
    expect(sql).not.toMatch(/message_text|prompt|content_json/iu);
  });

  it('moves the reviewed Free routes to current key-scoped BotHub models without destructive SQL', async () => {
    const sql = await readFile(
      new URL('../../migrations/0035_current_free_roleplay_models.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("WHERE model_profile_id = 'velora-free-roleplay'");
    expect(sql).toContain("WHERE model_profile_id = 'velora-free-context'");
    expect(sql).toContain("display_name = 'Qwen Roleplay'");
    expect(sql).toContain("display_name = 'VeloraAI Nano'");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE/iu);
  });

  it('restores the cheaper reviewed roleplay routes after current catalog verification', async () => {
    const sql = await readFile(
      new URL('../../migrations/0048_restore_economical_roleplay_routes.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("display_name = 'Lunaris Roleplay'");
    expect(sql).toContain("display_name = 'Mistral Nemo'");
    expect(sql).toContain("WHERE model_profile_id = 'velora-free-roleplay'");
    expect(sql).toContain("WHERE model_profile_id = 'velora-free-context'");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE/iu);
  });

  it('stores roleplay benchmark evidence and owner scores without generated prose', async () => {
    const sql = await readFile(
      new URL('../../migrations/0049_roleplay_benchmark_reviews.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE roleplay_benchmark_runs');
    expect(sql).toContain('CREATE TABLE roleplay_benchmark_scores');
    expect(sql).toContain("'AWAITING_REVIEW'");
    expect(sql).toContain("'consensual_mature_fictional_compatibility'");
    expect(sql).toContain('score BETWEEN 1 AND 5');
    expect(sql).toContain('scenario_evidence_json');
    expect(sql).not.toMatch(/prompt|generated_(?:text|prose)|output_text|content_json/iu);
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|ALTER\s+TABLE/iu);
  });

  it('adds bounded character focal points without replacing or deleting media', async () => {
    const sql = await readFile(
      new URL('../../migrations/0036_character_avatar_focal_point.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN avatar_focal_x REAL NOT NULL DEFAULT 50');
    expect(sql).toContain('ADD COLUMN avatar_focal_y REAL NOT NULL DEFAULT 50');
    expect(sql).toContain('avatar_focal_x >= 0 AND avatar_focal_x <= 100');
    expect(sql).toContain('avatar_focal_y >= 0 AND avatar_focal_y <= 100');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+file_objects/iu);
  });

  it('adds the detailed response preset while preserving every conversation setting', async () => {
    const sql = await readFile(
      new URL('../../migrations/0037_detailed_response_length.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("('SHORT', 'MEDIUM', 'DETAILED', 'LONG')");
    expect(sql).toContain('INSERT INTO conversation_settings_v2');
    expect(sql).toContain('FROM conversation_settings');
    expect(sql).toContain('model_profile_id');
    expect(sql).toContain('ALTER TABLE conversation_settings_v2 RENAME TO conversation_settings');
    expect(sql).not.toMatch(/DELETE\s+FROM|UPDATE\s+conversation_settings/iu);
  });

  it('normalizes the complete message provenance model without dropping message data', async () => {
    const sql = await readFile(
      new URL('../../migrations/0038_message_provenance.sql', import.meta.url),
      'utf8',
    );
    for (const column of [
      'content_format',
      'is_greeting',
      'edited_by_user',
      'origin',
      'updated_at',
      'deleted_at',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain("role IN ('USER', 'ASSISTANT', 'INTERNAL')");
    expect(sql).toContain("'DELETED', 'MODERATED'");
    expect(sql).toContain("CASE role WHEN 'SYSTEM_INTERNAL' THEN 'INTERNAL'");
    expect(sql).toContain('INSERT INTO messages_v2');
    expect(sql).toContain('FROM messages');
    expect(sql).toContain('PRAGMA defer_foreign_keys = ON');
    expect(sql).not.toMatch(/DELETE\s+FROM\s+messages/iu);
  });

  it('renames the active branch pointer to its canonical leaf name without rewriting data', async () => {
    const sql = await readFile(
      new URL('../../migrations/0039_active_leaf_message.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain(
      'ALTER TABLE conversations RENAME COLUMN active_message_id TO active_leaf_message_id',
    );
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+conversations/iu);
  });

  it('splits memory without allowing legacy user context to be erased by automation', async () => {
    const sql = await readFile(
      new URL('../../migrations/0040_split_memory_context.sql', import.meta.url),
      'utf8',
    );
    for (const column of [
      'manual_context',
      'auto_summary',
      'current_version_id',
      'source',
      'provider',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain('SET manual_context = content');
    expect(sql).toContain("auto_summary = ''");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM/iu);
  });

  it('records the exact message that invalidated automatic memory without destructive SQL', async () => {
    const sql = await readFile(
      new URL('../../migrations/0041_memory_invalidation_anchor.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN memory_stale_since_message_id TEXT');
    expect(sql).toContain('CREATE INDEX idx_conversations_memory_stale');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+conversations/iu);
  });

  it('enforces one active generation per user without deleting existing locks', async () => {
    const sql = await readFile(
      new URL('../../migrations/0042_user_generation_budget_guards.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE');
    expect(sql).toContain('CREATE UNIQUE INDEX idx_generation_locks_user');
    expect(sql).toContain('WHERE user_id IS NOT NULL');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+generation_locks/iu);
  });

  it('persists an explicit non-destructive Cloudflare runtime policy', async () => {
    const sql = await readFile(
      new URL('../../migrations/0043_runtime_capacity_state.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE runtime_capacity_state');
    expect(sql).toContain('core_chat_enabled INTEGER NOT NULL CHECK (core_chat_enabled = 1)');
    expect(sql).toContain("VALUES ('cloudflare-free', 'OK', 1, 1, 1, 1, 0)");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+/iu);
  });

  it('adds opt-in character personality visibility without exposing existing characters', async () => {
    const [sql, publicRoutes, discoveryRoutes] = await Promise.all([
      readFile(
        new URL('../../migrations/0050_character_personality_visibility.sql', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../../apps/api/src/public-routes.ts', import.meta.url), 'utf8'),
      readFile(new URL('../../apps/api/src/discovery-routes.ts', import.meta.url), 'utf8'),
    ]);
    expect(sql).toContain('ADD COLUMN personality_visible INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('personality_visible IN (0, 1)');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+characters/iu);
    for (const source of [publicRoutes, discoveryRoutes]) {
      expect(source).toContain(
        'CASE WHEN c.personality_visible = 1 THEN v.personality ELSE NULL END AS personality',
      );
    }
  });

  it('adds non-content diagnostic codes to failed Character Bot requests', async () => {
    const sql = await readFile(
      new URL('../../migrations/0051_character_bot_error_codes.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN error_code TEXT');
    expect(sql).toContain('idx_character_bot_ai_recent_failures');
    expect(sql).toContain("WHERE status = 'FAILED'");
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+/iu);
  });

  it('stores user-scoped notifications with unread and deduplication indexes', async () => {
    const sql = await readFile(
      new URL('../../migrations/0052_user_notifications.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE user_notifications');
    expect(sql).toContain('UNIQUE(user_id, dedup_key)');
    expect(sql).toContain('idx_user_notifications_unread');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+users/iu);
  });

  it('adds non-destructive assistant history to Character Bot turns', async () => {
    const sql = await readFile(
      new URL('../../migrations/0053_character_bot_assistant_history.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('ADD COLUMN assistant_body TEXT');
    expect(sql).not.toMatch(/DROP\s+TABLE|DELETE\s+FROM|UPDATE\s+/iu);
  });

  it('creates editable override rows for every newly reviewed roleplay model', async () => {
    const sql = await readFile(
      new URL('../../migrations/0054_complete_roleplay_model_overrides.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('INSERT OR IGNORE INTO roleplay_model_overrides');
    expect(sql).toContain("'velora-qwen-story'");
    expect(sql).toContain("'velora-chimera'");
    expect(sql).toContain("'velora-kimi-epic'");
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE)\b|DELETE\s+FROM/iu);
  });

  it('replaces failed model routes without rewriting historical provider evidence', async () => {
    const sql = await readFile(
      new URL('../../migrations/0055_replace_unstable_roleplay_models.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("'velora-rocinante'");
    expect(sql).toContain("'velora-deepseek-r1'");
    expect(sql).toContain("'velora-llama-epic'");
    expect(sql).toContain('UPDATE conversation_settings');
    expect(sql).toContain('UPDATE character_avatar_bots');
    expect(sql).not.toMatch(
      /UPDATE\s+(?:ai_requests|provider_smoke_runs|roleplay_benchmark_runs)/iu,
    );
    expect(sql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE)\b/iu);
  });

  it('disables replacement routes rejected by a real provider smoke', async () => {
    const sql = await readFile(
      new URL('../../migrations/0056_disable_failed_replacement_models.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("'velora-rocinante'");
    expect(sql).toContain("'velora-deepseek-r1'");
    expect(sql).toContain('UPDATE conversation_settings');
    expect(sql).toContain('UPDATE character_avatar_bots');
    expect(sql).not.toMatch(
      /UPDATE\s+(?:ai_requests|provider_smoke_runs|roleplay_benchmark_runs)/iu,
    );
    expect(sql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE)\b/iu);
  });

  it('removes the forced-short-answer conflict from the Alice production fixture', async () => {
    const sql = await readFile(
      new URL('../../migrations/0057_enrich_alice_roleplay.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("WHERE id = 'alice-dvachevskaya-v1'");
    expect(sql).toContain('3–6 связными абзацами');
    expect(sql).toContain('в *звёздочках*');
    expect(sql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE)\b/iu);
  });

  it('keeps the owner reference Alice bot on the validated balanced route', async () => {
    const sql = await readFile(
      new URL('../../migrations/0058_alice_balanced_model.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain("model_profile_id = 'velora-balanced'");
    expect(sql).toContain("id = '9abf0141-9278-4be2-aaeb-63b8cb85da9a'");
    expect(sql).not.toMatch(/\b(?:DROP|DELETE|TRUNCATE)\b/iu);
  });

  it('stores AvatarBot model choices per Telegram user and resets the legacy shared choice', async () => {
    const sql = await readFile(
      new URL('../../migrations/0059_avatar_bot_user_model_preferences.sql', import.meta.url),
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE character_bot_user_model_preferences');
    expect(sql).toContain('PRIMARY KEY (avatar_bot_id, telegram_user_id)');
    expect(sql).toContain('REFERENCES character_avatar_bots(id) ON DELETE CASCADE');
    expect(sql).toContain("model_profile_id = 'velora-free-roleplay'");
    expect(sql).not.toMatch(/\b(?:DROP|TRUNCATE)\b|DELETE\s+FROM/iu);
  });
});
