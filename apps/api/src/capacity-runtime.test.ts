import { describe, expect, it } from 'vitest';
import { deriveCapacityRuntimePolicy } from './capacity-runtime';
import type { CapacityStatus, CloudflareCapacityProjection } from './cloudflare-capacity';

function projection(status: CapacityStatus): CloudflareCapacityProjection {
  return {
    safetyMarginPercent: 35,
    basisWindowHours: 24,
    metrics: [
      {
        key: 'workerRequests',
        period: 'DAY',
        projected: 1,
        freeLimit: 1,
        utilizationPercent: 1,
        status,
      },
    ],
    exceedsFreePlan: status === 'EXCEEDED',
    automaticUpgradeEnabled: false,
  };
}

describe('Cloudflare runtime capacity policy', () => {
  it.each(['OK', 'WARNING'] as const)('keeps normal operation at %s', (status) => {
    expect(deriveCapacityRuntimePolicy(projection(status))).toEqual({
      status,
      analyticsEnabled: true,
      cacheTtlMultiplier: 1,
      backgroundJobsEnabled: true,
      coreChatEnabled: true,
    });
  });

  it.each([
    ['CRITICAL', 2],
    ['EMERGENCY', 3],
    ['EXCEEDED', 6],
  ] as const)('degrades only non-critical work at %s', (status, cacheTtlMultiplier) => {
    expect(deriveCapacityRuntimePolicy(projection(status))).toEqual({
      status,
      analyticsEnabled: false,
      cacheTtlMultiplier,
      backgroundJobsEnabled: false,
      coreChatEnabled: true,
    });
  });
});
