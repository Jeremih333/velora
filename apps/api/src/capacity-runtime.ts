import { nowMs } from '@velora/shared';
import {
  projectCloudflareFreeCapacity,
  type CapacityProjectionInput,
  type CapacityStatus,
  type CloudflareCapacityProjection,
} from './cloudflare-capacity';

export interface CapacityRuntimePolicy {
  readonly status: CapacityStatus;
  readonly analyticsEnabled: boolean;
  readonly cacheTtlMultiplier: 1 | 2 | 3 | 6;
  readonly backgroundJobsEnabled: boolean;
  readonly coreChatEnabled: true;
}

interface RuntimePolicyRow {
  readonly status: CapacityStatus;
  readonly analyticsEnabled: number;
  readonly cacheTtlMultiplier: number;
  readonly backgroundJobsEnabled: number;
  readonly coreChatEnabled: number;
}

const rank: Readonly<Record<CapacityStatus, number>> = {
  OK: 0,
  WARNING: 1,
  CRITICAL: 2,
  EMERGENCY: 3,
  EXCEEDED: 4,
};
const POLICY_CACHE_MS = 60_000;
let cachedPolicy: {
  readonly database: D1Database;
  readonly value: CapacityRuntimePolicy;
  readonly expiresAt: number;
} | null = null;

export function deriveCapacityRuntimePolicy(
  projection: CloudflareCapacityProjection,
): CapacityRuntimePolicy {
  const status = projection.metrics.reduce<CapacityStatus>(
    (highest, metric) => (rank[metric.status] > rank[highest] ? metric.status : highest),
    'OK',
  );
  const constrained = rank[status] >= rank.CRITICAL;
  return {
    status,
    analyticsEnabled: !constrained,
    cacheTtlMultiplier:
      status === 'EXCEEDED' ? 6 : status === 'EMERGENCY' ? 3 : status === 'CRITICAL' ? 2 : 1,
    backgroundJobsEnabled: !constrained,
    coreChatEnabled: true,
  };
}

export async function refreshCapacityRuntimeState(
  database: D1Database,
  timestamp = nowMs(),
): Promise<CapacityRuntimePolicy> {
  const input = await readProjectionInput(database, timestamp);
  const policy = deriveCapacityRuntimePolicy(projectCloudflareFreeCapacity(input));
  await database
    .prepare(
      `INSERT INTO runtime_capacity_state
       (state_key, status, analytics_enabled, cache_ttl_multiplier,
        background_jobs_enabled, core_chat_enabled, observed_at)
       VALUES ('cloudflare-free', ?, ?, ?, ?, 1, ?)
       ON CONFLICT(state_key) DO UPDATE SET status = excluded.status,
         analytics_enabled = excluded.analytics_enabled,
         cache_ttl_multiplier = excluded.cache_ttl_multiplier,
         background_jobs_enabled = excluded.background_jobs_enabled,
         core_chat_enabled = 1, observed_at = excluded.observed_at`,
    )
    .bind(
      policy.status,
      policy.analyticsEnabled ? 1 : 0,
      policy.cacheTtlMultiplier,
      policy.backgroundJobsEnabled ? 1 : 0,
      timestamp,
    )
    .run();
  cachedPolicy = { database, value: policy, expiresAt: timestamp + POLICY_CACHE_MS };
  return policy;
}

export async function readCapacityRuntimePolicy(
  database: D1Database,
  timestamp = nowMs(),
): Promise<CapacityRuntimePolicy> {
  if (cachedPolicy?.database === database && cachedPolicy.expiresAt > timestamp) {
    return cachedPolicy.value;
  }
  const row = await database
    .prepare(
      `SELECT status, analytics_enabled AS analyticsEnabled,
       cache_ttl_multiplier AS cacheTtlMultiplier,
       background_jobs_enabled AS backgroundJobsEnabled,
       core_chat_enabled AS coreChatEnabled
       FROM runtime_capacity_state WHERE state_key = 'cloudflare-free'`,
    )
    .first<RuntimePolicyRow>();
  const value: CapacityRuntimePolicy = row
    ? {
        status: row.status,
        analyticsEnabled: row.analyticsEnabled === 1,
        cacheTtlMultiplier: normalizeMultiplier(row.cacheTtlMultiplier),
        backgroundJobsEnabled: row.backgroundJobsEnabled === 1,
        coreChatEnabled: true,
      }
    : defaultCapacityRuntimePolicy();
  cachedPolicy = { database, value, expiresAt: timestamp + POLICY_CACHE_MS };
  return value;
}

export async function capacityAwarePublicCacheTtl(
  database: D1Database,
  normalTtlSeconds: number,
): Promise<number> {
  const policy = await readCapacityRuntimePolicy(database);
  return Math.max(1, Math.round(normalTtlSeconds * policy.cacheTtlMultiplier));
}

export async function allowsNonCriticalAnalytics(database: D1Database): Promise<boolean> {
  return (await readCapacityRuntimePolicy(database)).analyticsEnabled;
}

function defaultCapacityRuntimePolicy(): CapacityRuntimePolicy {
  return {
    status: 'OK',
    analyticsEnabled: true,
    cacheTtlMultiplier: 1,
    backgroundJobsEnabled: true,
    coreChatEnabled: true,
  };
}

function normalizeMultiplier(value: number): CapacityRuntimePolicy['cacheTtlMultiplier'] {
  if (value >= 6) return 6;
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

async function readProjectionInput(
  database: D1Database,
  timestamp: number,
): Promise<CapacityProjectionInput> {
  const since = timestamp - 24 * 60 * 60 * 1000;
  const row = await database
    .prepare(
      `SELECT
       (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND last_seen_at >= ?) AS activeUsers24h,
       (SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL AND created_at >= ?) AS messages24h,
       (SELECT COUNT(*) FROM ai_requests WHERE created_at >= ?) AS aiRequests24h,
       (SELECT COUNT(*) FROM product_events WHERE created_at >= ?) AS productEvents24h,
       (SELECT COUNT(*) FROM jobs WHERE created_at >= ?) AS jobsCreated24h,
       (SELECT COUNT(*) FROM file_objects WHERE deleted_at IS NULL AND created_at >= ?)
         AS mediaObjectsCreated24h,
       (SELECT COALESCE(SUM(byte_size), 0) FROM file_objects
         WHERE deleted_at IS NULL AND created_at >= ?) AS mediaBytesCreated24h,
       (SELECT COALESCE(SUM(byte_size), 0) FROM file_objects WHERE deleted_at IS NULL)
         AS mediaBytesTotal`,
    )
    .bind(since, since, since, since, since, since, since)
    .first<CapacityProjectionInput>();
  return (
    row ?? {
      activeUsers24h: 0,
      messages24h: 0,
      aiRequests24h: 0,
      productEvents24h: 0,
      jobsCreated24h: 0,
      mediaObjectsCreated24h: 0,
      mediaBytesCreated24h: 0,
      mediaBytesTotal: 0,
    }
  );
}
