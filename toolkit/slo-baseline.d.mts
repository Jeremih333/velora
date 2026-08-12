export type SloEnvironment = 'local' | 'staging';

export interface ProbeFailure {
  readonly sample: number;
  readonly category: string;
  readonly status?: number;
}

export interface ProbeSummary {
  readonly requested: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly availabilityRatio: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly maxMs: number | null;
  readonly failures: readonly ProbeFailure[];
}

export interface SloBaselineReport {
  readonly schemaVersion: 1;
  readonly environment: SloEnvironment;
  readonly baseUrl: string;
  readonly samplesPerProbe: number;
  readonly totalRequests: number;
  readonly measuredAt: string;
  readonly probes: Readonly<Record<string, ProbeSummary>>;
}

export function validateTarget(baseUrl: string, environment: string): string;
export function percentile(values: readonly number[], ratio: number): number;
export function measureSloBaseline(input: {
  readonly baseUrl: string;
  readonly environment: SloEnvironment;
  readonly samples?: number;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}): Promise<SloBaselineReport>;
