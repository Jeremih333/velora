import { AppError, createId, nowMs } from '@velora/shared';
import { sha256 } from './telegram-auth';
import type { SessionPrincipal } from './session';
import { allowsNonCriticalAnalytics } from './capacity-runtime';

export type RateLimitScope =
  | 'AUTH'
  | 'GENERATION'
  | 'CHARACTER_CREATE'
  | 'SEARCH'
  | 'REPORT'
  | 'MEDIA_UPLOAD'
  | 'AVATAR_GENERATION'
  | 'CHARACTER_ASSIST'
  | 'MEMORY_REBUILD'
  | 'SESSION_MUTATION';

export interface RateLimitPolicy {
  readonly scope: RateLimitScope;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitState {
  readonly count: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
}

export type ProductEventName =
  | 'CHARACTER_OPEN'
  | 'CHAT_STARTED'
  | 'MESSAGE_SENT'
  | 'GENERATION_COMPLETED'
  | 'REGENERATED'
  | 'MEMORY_SUMMARIZED'
  | 'CHARACTER_CREATED'
  | 'CHARACTER_PUBLISHED'
  | 'PAYMENT_COMPLETED';

export type FeatureFlagKey =
  'advanced_memory' | 'new_model' | 'public_reviews' | 'experimental_renderer' | 'groups';

const policies: readonly RateLimitPolicy[] = [
  { scope: 'GENERATION', limit: 20, windowMs: 10 * 60_000 },
  { scope: 'CHARACTER_CREATE', limit: 10, windowMs: 60 * 60_000 },
  { scope: 'SEARCH', limit: 60, windowMs: 60_000 },
  { scope: 'REPORT', limit: 5, windowMs: 60 * 60_000 },
  { scope: 'MEDIA_UPLOAD', limit: 20, windowMs: 60 * 60_000 },
  { scope: 'MEMORY_REBUILD', limit: 6, windowMs: 60 * 60_000 },
  { scope: 'SESSION_MUTATION', limit: 30, windowMs: 60_000 },
] as const;

export function alignedWindow(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function policyForRequest(method: string, path: string): RateLimitPolicy | null {
  if (method === 'GET' && path === '/api/v1/discovery') return policy('SEARCH');
  if (method === 'GET' && /^\/api\/v1\/public\/(tags|trending|characters\/[^/]+)$/u.test(path)) {
    return policy('SEARCH');
  }
  if (method === 'POST' && path === '/api/v1/characters') return policy('CHARACTER_CREATE');
  if (method === 'POST' && /^\/api\/v1\/conversations\/[^/]+\/generate$/u.test(path)) {
    return policy('GENERATION');
  }
  if (method === 'POST' && path === '/api/v1/reports') return policy('REPORT');
  if (method === 'POST' && path === '/api/v1/support/requests') return policy('REPORT');
  if (method === 'POST' && path === '/api/v1/media') return policy('MEDIA_UPLOAD');
  if (
    method === 'POST' &&
    /^\/api\/v1\/conversations\/[^/]+\/memory\/(summarize|regenerate)$/u.test(path)
  ) {
    return policy('MEMORY_REBUILD');
  }
  if (
    ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) &&
    (path === '/api/v1/settings' ||
      path === '/api/v1/age-gate' ||
      path === '/api/v1/onboarding/complete' ||
      path === '/api/v1/billing/invoices' ||
      path === '/api/v1/billing/access-invoices' ||
      path.startsWith('/api/v1/admin/billing/'))
  ) {
    return policy('SESSION_MUTATION');
  }
  if (
    ['POST', 'PUT', 'DELETE'].includes(method) &&
    (path === '/api/v1/data-controls/account-deletion' || /^\/api\/v1\/blocks\/[^/]+$/u.test(path))
  ) {
    return policy('SESSION_MUTATION');
  }
  if (method === 'PATCH' && path === '/api/v1/profiles/me') {
    return policy('SESSION_MUTATION');
  }
  return null;
}

export function effectiveLimit(
  baseLimit: number,
  role: SessionPrincipal['role'],
  moderationState: SessionPrincipal['moderationState'],
): number {
  if (moderationState !== 'ACTIVE') return Math.max(1, Math.floor(baseLimit / 2));
  return role === 'ADMIN' || role === 'OWNER' ? baseLimit * 2 : baseLimit;
}

export async function enforceRateLimit(
  database: D1Database,
  input: {
    readonly policy: RateLimitPolicy;
    readonly subject: string;
    readonly limit?: number;
    readonly now?: number;
  },
): Promise<RateLimitState> {
  const timestamp = input.now ?? nowMs();
  const windowStartedAt = alignedWindow(timestamp, input.policy.windowMs);
  const resetAt = windowStartedAt + input.policy.windowMs;
  const subjectHash = await sha256(`velora-rate:${input.policy.scope}:${input.subject}`);
  const row = await database
    .prepare(
      `INSERT INTO api_rate_limits (scope, subject_hash, window_started_at, count, expires_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(scope, subject_hash, window_started_at) DO UPDATE SET
         count = api_rate_limits.count + 1, expires_at = excluded.expires_at
       RETURNING count`,
    )
    .bind(input.policy.scope, subjectHash, windowStartedAt, resetAt + input.policy.windowMs)
    .first<{ count: number }>();
  const limit = input.limit ?? input.policy.limit;
  const count = row?.count ?? limit + 1;
  if (count > limit) {
    throw new AppError('RATE_LIMITED', 'Слишком много запросов. Попробуйте позже.', 429, [
      {
        scope: input.policy.scope,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - timestamp) / 1000)),
      },
    ]);
  }
  return { count, limit, remaining: Math.max(0, limit - count), resetAt };
}

export async function observeIpRateSignal(
  database: D1Database,
  scope: RateLimitScope,
  ip: string | undefined,
  now = nowMs(),
): Promise<void> {
  if (!ip) return;
  const windowMs = 60_000;
  const windowStartedAt = alignedWindow(now, windowMs);
  const subjectHash = await sha256(`velora-ip-signal:${scope}:${ip}`);
  await database
    .prepare(
      `INSERT INTO api_rate_limits (scope, subject_hash, window_started_at, count, expires_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(scope, subject_hash, window_started_at) DO UPDATE SET
         count = api_rate_limits.count + 1, expires_at = excluded.expires_at`,
    )
    .bind(`${scope}:IP_SIGNAL`, subjectHash, windowStartedAt, windowStartedAt + 2 * windowMs)
    .run();
}

export async function cleanupReliabilityData(database: D1Database, now = nowMs()): Promise<void> {
  await database.batch([
    database.prepare('DELETE FROM api_rate_limits WHERE expires_at < ?').bind(now),
    database
      .prepare('DELETE FROM product_events WHERE created_at < ?')
      .bind(now - 90 * 24 * 60 * 60 * 1000),
  ]);
}

export function productEventForRequest(
  method: string,
  path: string,
  status: number,
): { readonly name: ProductEventName; readonly routeGroup: string } | null {
  if (status < 200 || status >= 300) return null;
  if (method === 'POST' && path === '/api/v1/characters') {
    return { name: 'CHARACTER_CREATED', routeGroup: 'characters' };
  }
  if (method === 'POST' && /\/characters\/[^/]+\/publish$/u.test(path)) {
    return { name: 'CHARACTER_PUBLISHED', routeGroup: 'characters' };
  }
  if (method === 'GET' && /^\/api\/v1\/discovery\/[^/]+$/u.test(path)) {
    return { name: 'CHARACTER_OPEN', routeGroup: 'discovery' };
  }
  if (method === 'POST' && path === '/api/v1/conversations') {
    return { name: 'CHAT_STARTED', routeGroup: 'conversations' };
  }
  if (method === 'POST' && /\/conversations\/[^/]+\/messages$/u.test(path)) {
    return { name: 'MESSAGE_SENT', routeGroup: 'conversations' };
  }
  return null;
}

export async function recordProductEvent(
  database: D1Database,
  userId: string,
  event: { readonly name: ProductEventName; readonly routeGroup: string },
  sourceKey: string | null = null,
): Promise<void> {
  if (!(await allowsNonCriticalAnalytics(database))) return;
  await database
    .prepare(
      `INSERT INTO product_events
       (id, source_key, user_id, event_name, route_group, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_key) DO NOTHING`,
    )
    .bind(createId(), sourceKey, userId, event.name, event.routeGroup, nowMs())
    .run();
}

export async function isFeatureEnabled(
  database: D1Database,
  key: FeatureFlagKey,
  userId: string,
): Promise<boolean> {
  const row = await database
    .prepare('SELECT enabled, rollout_percent AS rolloutPercent FROM feature_flags WHERE key = ?')
    .bind(key)
    .first<{ enabled: number; rolloutPercent: number }>();
  if (row?.enabled !== 1) return false;
  if (row.rolloutPercent <= 0) return false;
  if (row.rolloutPercent >= 100) return true;
  const digest = await sha256(`velora-flag:${key}:${userId}`);
  const bucket = Number.parseInt(digest.slice(0, 8), 16) % 100;
  return bucket < row.rolloutPercent;
}

function policy(scope: RateLimitScope): RateLimitPolicy {
  const found = policies.find((item) => item.scope === scope);
  if (!found) throw new Error(`Missing rate limit policy: ${scope}`);
  return found;
}
