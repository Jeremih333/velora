import { describe, expect, it, vi } from 'vitest';

import {
  FREE_LIMITS,
  buildReport,
  classifyUsage,
  readCloudflareFreeUsage,
} from '../../toolkit/cloudflare-free-usage.mjs';

describe('Cloudflare Free usage guard', () => {
  it('classifies the reviewed warning and critical boundaries', () => {
    expect(classifyUsage(69, 100).status).toBe('OK');
    expect(classifyUsage(70, 100).status).toBe('WARNING');
    expect(classifyUsage(85, 100).status).toBe('CRITICAL');
  });

  it('evaluates account-wide Worker, D1 row, storage and database limits', () => {
    const report = buildReport(
      {
        workersInvocationsAdaptive: [{ sum: { requests: 50_000 } }, { sum: { requests: 20_000 } }],
        d1AnalyticsAdaptiveGroups: [
          { sum: { rowsRead: 4_000_000, rowsWritten: 15_000 } },
          { sum: { rowsRead: 250_000, rowsWritten: 5_000 } },
        ],
      },
      [{ file_size: 2_000_000_000 }, { file_size: 2_300_000_000 }],
    );

    expect(report.workerRequests.status).toBe('WARNING');
    expect(report.d1RowsRead.status).toBe('CRITICAL');
    expect(report.d1RowsWritten.status).toBe('OK');
    expect(report.d1Storage.status).toBe('CRITICAL');
    expect(report.d1DatabaseCount.value).toBe(2);
    expect(report.d1DatabaseCount.limit).toBe(FREE_LIMITS.d1Databases);
  });

  it('queries only read-only analytics and inventory endpoints without leaking the token', async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn((url: string | URL | Request, init: RequestInit = {}) => {
      const normalizedUrl = url instanceof Request ? url.url : url.toString();
      requests.push({ url: normalizedUrl, init });
      if (normalizedUrl.endsWith('/graphql')) {
        return Promise.resolve(
          Response.json({
            data: {
              viewer: {
                accounts: [
                  {
                    workersInvocationsAdaptive: [{ sum: { requests: 7 } }],
                    d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 11, rowsWritten: 3 } }],
                  },
                ],
              },
            },
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          success: true,
          result: [{ file_size: 123 }],
          result_info: { total_pages: 1 },
        }),
      );
    });

    const report = await readCloudflareFreeUsage({
      accountId: 'account-id',
      apiToken: 'top-secret-token',
      fetchImpl,
      now: new Date('2026-08-12T12:00:00.000Z'),
    });

    expect(report.workerRequests.value).toBe(7);
    expect(requests).toHaveLength(2);
    expect(requests.every(({ init }) => init.method === 'GET' || init.method === 'POST')).toBe(
      true,
    );
    expect(JSON.stringify(requests.map(({ url }) => url))).not.toContain('top-secret-token');
    const graphQlBody = requests[0]?.init.body;
    expect(typeof graphQlBody === 'string' ? graphQlBody : '').toContain(
      '2026-08-12T00:00:00.000Z',
    );
  });

  it('fails closed on missing analytics instead of reporting a false zero', () => {
    expect(() => buildReport({}, [])).toThrow(/false zero/u);
  });

  it('fails closed on GraphQL errors', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(Response.json({ errors: [{ message: 'forbidden' }] })),
    );
    await expect(
      readCloudflareFreeUsage({ accountId: 'account-id', apiToken: 'token', fetchImpl }),
    ).rejects.toThrow(/schema or authorization/u);
  });
});
