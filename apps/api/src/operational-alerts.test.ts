import { describe, expect, it } from 'vitest';
import {
  deriveOperationalSignals,
  operationalFailureWindowStart,
  shouldNotifyAlert,
} from './operational-alerts';

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

  it('notifies an open incident once until it is resolved', () => {
    const now = 10 * 60 * 60 * 1000;
    expect(shouldNotifyAlert(null)).toBe(true);
    expect(shouldNotifyAlert(now - 24 * 60 * 60 * 1000)).toBe(false);
  });

  it('only treats recent DEAD transitions as an active operational failure', () => {
    const now = Date.UTC(2026, 7, 25, 12, 0, 0);
    expect(operationalFailureWindowStart(now)).toBe(now - 15 * 60 * 1000);
  });
});
