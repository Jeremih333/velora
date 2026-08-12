export type UsageStatus = 'OK' | 'WARNING' | 'CRITICAL';

export interface UsageMetric {
  readonly value: number;
  readonly limit: number;
  readonly ratio: number;
  readonly status: UsageStatus;
}

export interface FreeUsageReport {
  readonly workerRequests: UsageMetric;
  readonly d1RowsRead: UsageMetric;
  readonly d1RowsWritten: UsageMetric;
  readonly d1Storage: UsageMetric;
  readonly d1DatabaseCount: UsageMetric;
}

export const FREE_LIMITS: Readonly<{
  workerRequestsPerDay: number;
  d1RowsReadPerDay: number;
  d1RowsWrittenPerDay: number;
  d1StorageBytes: number;
  d1Databases: number;
}>;

export function classifyUsage(value: number, limit: number): UsageMetric;

export function buildReport(
  analytics: {
    readonly workersInvocationsAdaptive?: readonly {
      readonly sum?: { readonly requests?: number };
    }[];
    readonly d1AnalyticsAdaptiveGroups?: readonly {
      readonly sum?: { readonly rowsRead?: number; readonly rowsWritten?: number };
    }[];
  },
  databases: readonly { readonly file_size?: number }[],
): FreeUsageReport;

export function readCloudflareFreeUsage(input: {
  readonly accountId: string;
  readonly apiToken: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: Date;
}): Promise<FreeUsageReport>;
