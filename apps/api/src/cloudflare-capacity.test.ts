import { describe, expect, it } from 'vitest';
import { projectCloudflareFreeCapacity } from './cloudflare-capacity';

describe('Cloudflare Free capacity projection', () => {
  it('returns every required Cloudflare resource with a conservative reserve', () => {
    const projection = projectCloudflareFreeCapacity({
      activeUsers24h: 10,
      messages24h: 20,
      aiRequests24h: 5,
      productEvents24h: 40,
      jobsCreated24h: 2,
      mediaObjectsCreated24h: 3,
      mediaBytesCreated24h: 1_000,
      mediaBytesTotal: 5_000,
    });

    expect(projection.metrics.map(({ key }) => key)).toEqual([
      'workerRequests',
      'd1RowsRead',
      'd1RowsWritten',
      'queueOperations',
      'r2Storage',
      'r2ClassAOperations',
      'r2ClassBOperations',
    ]);
    expect(projection.metrics[0]?.projected).toBe(1_620);
    expect(projection.safetyMarginPercent).toBe(35);
    expect(projection.automaticUpgradeEnabled).toBe(false);
  });

  it('warns before the limit and marks a forecast above Free as exceeded', () => {
    const warning = projectCloudflareFreeCapacity({
      activeUsers24h: 450,
      messages24h: 0,
      aiRequests24h: 0,
      productEvents24h: 0,
      jobsCreated24h: 0,
      mediaObjectsCreated24h: 0,
      mediaBytesCreated24h: 0,
      mediaBytesTotal: 0,
    });
    expect(warning.metrics[0]?.status).toBe('WARNING');
    expect(warning.exceedsFreePlan).toBe(false);

    const exceeded = projectCloudflareFreeCapacity({
      activeUsers24h: 1_000,
      messages24h: 0,
      aiRequests24h: 0,
      productEvents24h: 0,
      jobsCreated24h: 0,
      mediaObjectsCreated24h: 0,
      mediaBytesCreated24h: 0,
      mediaBytesTotal: 0,
    });
    expect(exceeded.metrics[0]?.status).toBe('EXCEEDED');
    expect(exceeded.exceedsFreePlan).toBe(true);
  });

  it.each([
    [69, 'OK'],
    [70, 'WARNING'],
    [85, 'CRITICAL'],
    [95, 'EMERGENCY'],
    [101, 'EXCEEDED'],
  ] as const)('uses the explicit %s%% release threshold as %s', (percent, expected) => {
    const projection = projectCloudflareFreeCapacity({
      activeUsers24h: 0,
      messages24h: 0,
      aiRequests24h: 0,
      productEvents24h: 0,
      jobsCreated24h: 0,
      mediaObjectsCreated24h: 0,
      mediaBytesCreated24h: 0,
      mediaBytesTotal: Math.ceil((10 * 1024 * 1024 * 1024 * percent) / 100 / 1.35),
    });

    expect(projection.metrics.find(({ key }) => key === 'r2Storage')?.status).toBe(expected);
  });
});
