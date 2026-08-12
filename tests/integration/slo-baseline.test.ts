import { describe, expect, it, vi } from 'vitest';

import { measureSloBaseline, percentile, validateTarget } from '../../toolkit/slo-baseline.mjs';

describe('bounded SLO baseline', () => {
  it('forbids production and accepts only the isolated staging origin', () => {
    expect(validateTarget('https://velora-staging.carreljeremih.workers.dev', 'staging')).toBe(
      'https://velora-staging.carreljeremih.workers.dev',
    );
    expect(() => validateTarget('https://velora-app.carreljeremih.workers.dev', 'staging')).toThrow(
      /isolated Velora staging/u,
    );
    expect(() =>
      validateTarget('https://velora-staging.carreljeremih.workers.dev', 'production'),
    ).toThrow(/production is forbidden/u);
    expect(() => validateTarget('http://example.test:8787', 'local')).toThrow(/localhost/u);
  });

  it('uses the nearest-rank percentile deterministically', () => {
    expect(percentile([40, 10, 20, 30], 0.5)).toBe(20);
    expect(percentile([40, 10, 20, 30], 0.95)).toBe(40);
  });

  it('measures only four read-only public probes and validates their payloads', async () => {
    const requested: string[] = [];
    let clock = 0;
    const fetchImpl = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : input instanceof URL ? input.href : input;
      requested.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
      const pathname = new URL(url).pathname;
      const payload =
        pathname === '/health'
          ? { status: 'ok' }
          : pathname === '/ready'
            ? { status: 'ready', dependencies: { d1: true } }
            : pathname === '/api/v1/config'
              ? { environment: 'staging', appName: 'Velora' }
              : {
                  openapi: '3.1.0',
                  paths: Object.fromEntries(
                    Array.from({ length: 100 }, (_, index) => [`/${String(index)}`, {}]),
                  ),
                };
      return Promise.resolve(Response.json(payload));
    });
    const report = await measureSloBaseline({
      baseUrl: 'https://velora-staging.carreljeremih.workers.dev',
      environment: 'staging',
      samples: 3,
      fetchImpl,
      now: () => {
        clock += 5;
        return clock;
      },
    });

    expect(report.totalRequests).toBe(12);
    expect(report.probes['health']).toMatchObject({ failed: 0, p50Ms: 5, p95Ms: 5 });
    expect(requested).toHaveLength(12);
    expect(requested.every((request) => request.startsWith('GET '))).toBe(true);
  });

  it('records invalid dependencies as failures instead of false availability', async () => {
    const report = await measureSloBaseline({
      baseUrl: 'http://127.0.0.1:8787',
      environment: 'local',
      samples: 3,
      fetchImpl: () => Promise.resolve(Response.json({ status: 'ok' })),
    });
    expect(report.probes['health']?.failed).toBe(0);
    expect(report.probes['ready']?.failed).toBe(3);
    expect(report.probes['publicConfig']?.failed).toBe(3);
    expect(report.probes['openApi']?.failed).toBe(3);
  });
});
