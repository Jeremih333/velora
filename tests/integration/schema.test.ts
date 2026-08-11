import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('initial schema contract', () => {
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
});
