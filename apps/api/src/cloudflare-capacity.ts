export type CapacityStatus = 'OK' | 'WARNING' | 'CRITICAL' | 'EMERGENCY' | 'EXCEEDED';

export interface CapacityMetric {
  readonly key:
    | 'workerRequests'
    | 'd1RowsRead'
    | 'd1RowsWritten'
    | 'queueOperations'
    | 'r2Storage'
    | 'r2ClassAOperations'
    | 'r2ClassBOperations';
  readonly period: 'DAY' | 'MONTH' | 'TOTAL';
  readonly projected: number;
  readonly freeLimit: number;
  readonly utilizationPercent: number;
  readonly status: CapacityStatus;
}

export interface CloudflareCapacityProjection {
  readonly safetyMarginPercent: 35;
  readonly basisWindowHours: 24;
  readonly metrics: readonly CapacityMetric[];
  readonly exceedsFreePlan: boolean;
  readonly automaticUpgradeEnabled: false;
}

export interface CapacityProjectionInput {
  readonly activeUsers24h: number;
  readonly messages24h: number;
  readonly aiRequests24h: number;
  readonly productEvents24h: number;
  readonly jobsCreated24h: number;
  readonly mediaObjectsCreated24h: number;
  readonly mediaBytesCreated24h: number;
  readonly mediaBytesTotal: number;
}

const SAFETY_MULTIPLIER = 1.35;
const DAY_TO_MONTH = 30;
const GIB = 1024 * 1024 * 1024;

const limits = {
  workerRequestsPerDay: 100_000,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  queueOperationsPerDay: 10_000,
  r2StorageBytes: 10 * GIB,
  r2ClassAOperationsPerMonth: 1_000_000,
  r2ClassBOperationsPerMonth: 10_000_000,
} as const;

/**
 * A conservative planning forecast, not a Cloudflare billing counter.
 *
 * The coefficients deliberately overestimate the currently observed product activity and add a
 * 35% reserve. Actual account usage remains authoritative in Cloudflare Analytics/Billing.
 */
export function projectCloudflareFreeCapacity(
  input: CapacityProjectionInput,
): CloudflareCapacityProjection {
  const estimatedWorkerRequests = Math.max(
    input.activeUsers24h * 120,
    input.productEvents24h * 4 + input.messages24h * 6 + input.aiRequests24h * 8,
  );
  const projectedWorkerRequests = reserve(estimatedWorkerRequests);
  const projectedD1Reads = reserve(
    projectedWorkerRequests * 12 + input.messages24h * 18 + input.aiRequests24h * 30,
  );
  const projectedD1Writes = reserve(
    input.productEvents24h * 2 + input.messages24h * 3 + input.aiRequests24h * 5,
  );
  // Queue billing normally counts write + read + delete for one delivered message.
  const projectedQueueOperations = reserve(input.jobsCreated24h * 3);
  const projectedR2Storage = reserve(
    input.mediaBytesTotal + input.mediaBytesCreated24h * DAY_TO_MONTH,
  );
  const projectedR2ClassA = reserve(input.mediaObjectsCreated24h * DAY_TO_MONTH);
  const projectedR2ClassB = reserve(
    Math.max(input.mediaObjectsCreated24h, input.activeUsers24h * 4) * DAY_TO_MONTH,
  );

  const metrics = [
    metric('workerRequests', 'DAY', projectedWorkerRequests, limits.workerRequestsPerDay),
    metric('d1RowsRead', 'DAY', projectedD1Reads, limits.d1RowsReadPerDay),
    metric('d1RowsWritten', 'DAY', projectedD1Writes, limits.d1RowsWrittenPerDay),
    metric('queueOperations', 'DAY', projectedQueueOperations, limits.queueOperationsPerDay),
    metric('r2Storage', 'TOTAL', projectedR2Storage, limits.r2StorageBytes),
    metric('r2ClassAOperations', 'MONTH', projectedR2ClassA, limits.r2ClassAOperationsPerMonth),
    metric('r2ClassBOperations', 'MONTH', projectedR2ClassB, limits.r2ClassBOperationsPerMonth),
  ] as const;

  return {
    safetyMarginPercent: 35,
    basisWindowHours: 24,
    metrics,
    exceedsFreePlan: metrics.some((item) => item.status === 'EXCEEDED'),
    automaticUpgradeEnabled: false,
  };
}

function reserve(value: number): number {
  return Math.max(0, Math.ceil(value * SAFETY_MULTIPLIER));
}

function metric(
  key: CapacityMetric['key'],
  period: CapacityMetric['period'],
  projected: number,
  freeLimit: number,
): CapacityMetric {
  const utilizationPercent = freeLimit === 0 ? 0 : (projected / freeLimit) * 100;
  return {
    key,
    period,
    projected,
    freeLimit,
    utilizationPercent,
    status:
      utilizationPercent > 100
        ? 'EXCEEDED'
        : utilizationPercent >= 95
          ? 'EMERGENCY'
          : utilizationPercent >= 85
            ? 'CRITICAL'
            : utilizationPercent >= 70
              ? 'WARNING'
              : 'OK',
  };
}
