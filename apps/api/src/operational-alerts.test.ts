import { describe, expect, it } from 'vitest';
import { deriveOperationalSignals, shouldNotifyAlert } from './operational-alerts';

const emptyMetrics = {
  deadJobs: 0,
  failedDeletions: 0,
  repeatedTelegramFailures: 0,
  stuckPayments: 0,
  aiTotal15m: 0,
  aiFailed15m: 0,
  dailySpend: 0,
  monthlySpend: 0,
  lifetimeSpend: 0,
};
const limits = { daily: 1_000, monthly: 10_000, lifetime: 100_000 };

describe('operational alerts', () => {
  it('does not alert on an empty healthy system or a tiny AI sample', () => {
    expect(
      deriveOperationalSignals({ ...emptyMetrics, aiTotal15m: 4, aiFailed15m: 4 }, limits),
    ).toEqual([]);
  });

  it('classifies durable failures and budget thresholds without including content', () => {
    const signals = deriveOperationalSignals(
      { ...emptyMetrics, deadJobs: 5, aiTotal15m: 20, aiFailed15m: 5, dailySpend: 950 },
      limits,
    );
    expect(signals.map(({ key, severity }) => ({ key, severity }))).toEqual([
      { key: 'jobs.dead', severity: 'CRITICAL' },
      { key: 'ai.failure_rate', severity: 'WARNING' },
      { key: 'budget.daily', severity: 'CRITICAL' },
    ]);
    expect(JSON.stringify(signals)).not.toContain('prompt');
  });

  it('deduplicates warnings for six hours and critical alerts for one hour', () => {
    const now = 10 * 60 * 60 * 1000;
    expect(shouldNotifyAlert('WARNING', null, now)).toBe(true);
    expect(shouldNotifyAlert('WARNING', now - 5 * 60 * 60 * 1000, now)).toBe(false);
    expect(shouldNotifyAlert('WARNING', now - 6 * 60 * 60 * 1000, now)).toBe(true);
    expect(shouldNotifyAlert('CRITICAL', now - 59 * 60 * 1000, now)).toBe(false);
    expect(shouldNotifyAlert('CRITICAL', now - 60 * 60 * 1000, now)).toBe(true);
  });
});
