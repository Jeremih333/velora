import process from 'node:process';
import { fileURLToPath } from 'node:url';

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const API_BASE_URL = 'https://api.cloudflare.com/client/v4';

export const FREE_LIMITS = Object.freeze({
  workerRequestsPerDay: 100_000,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  d1StorageBytes: 5_000_000_000,
  d1Databases: 10,
});

const ANALYTICS_QUERY = `
  query VeloraFreeUsage(
    $accountTag: string!
    $start: Date
    $end: Date
    $datetimeStart: string
    $datetimeEnd: string
  ) {
    viewer {
      accounts(filter: { accountTag: $accountTag }) {
        workersInvocationsAdaptive(
          limit: 10000
          filter: { datetime_geq: $datetimeStart, datetime_leq: $datetimeEnd }
        ) {
          sum { requests errors }
        }
        d1AnalyticsAdaptiveGroups(
          limit: 10000
          filter: { date_geq: $start, date_leq: $end }
        ) {
          sum { rowsRead rowsWritten }
        }
      }
    }
  }
`;

export function classifyUsage(value, limit) {
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(limit) || limit <= 0) {
    throw new Error('Usage and limit must be finite non-negative numbers.');
  }

  const ratio = value / limit;
  const status = ratio >= 0.85 ? 'CRITICAL' : ratio >= 0.7 ? 'WARNING' : 'OK';
  return { value, limit, ratio, status };
}

export function buildReport(analytics, databases) {
  const workerGroups = requireGroups(analytics?.workersInvocationsAdaptive, 'Worker requests');
  const d1Groups = requireGroups(analytics?.d1AnalyticsAdaptiveGroups, 'D1 analytics');
  const requests = sumMetrics(workerGroups, (group) => group?.sum?.requests, 'Worker requests');
  const rowsRead = sumMetrics(d1Groups, (group) => group?.sum?.rowsRead, 'D1 rows read');
  const rowsWritten = sumMetrics(d1Groups, (group) => group?.sum?.rowsWritten, 'D1 rows written');
  if (!Array.isArray(databases)) throw new Error('Cloudflare D1 database inventory is missing.');

  const storageBytes = databases.reduce((total, database) => {
    const size = requireMetric(database?.file_size ?? 0, 'D1 database size');
    return total + size;
  }, 0);

  return {
    workerRequests: classifyUsage(requests, FREE_LIMITS.workerRequestsPerDay),
    d1RowsRead: classifyUsage(rowsRead, FREE_LIMITS.d1RowsReadPerDay),
    d1RowsWritten: classifyUsage(rowsWritten, FREE_LIMITS.d1RowsWrittenPerDay),
    d1Storage: classifyUsage(storageBytes, FREE_LIMITS.d1StorageBytes),
    d1DatabaseCount: classifyUsage(databases.length, FREE_LIMITS.d1Databases),
  };
}

export async function readCloudflareFreeUsage({
  accountId,
  apiToken,
  fetchImpl = fetch,
  now = new Date(),
}) {
  requireSecret(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  requireSecret(apiToken, 'CLOUDFLARE_ANALYTICS_TOKEN');

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000 - 1);
  const headers = {
    Authorization: `Bearer ${apiToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const analyticsResponse = await fetchImpl(GRAPHQL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: ANALYTICS_QUERY,
      variables: {
        accountTag: accountId,
        start: start.toISOString().slice(0, 10),
        end: start.toISOString().slice(0, 10),
        datetimeStart: start.toISOString(),
        datetimeEnd: end.toISOString(),
      },
    }),
  });
  const analyticsPayload = await readJson(analyticsResponse, 'Cloudflare GraphQL Analytics');
  if (Array.isArray(analyticsPayload.errors) && analyticsPayload.errors.length > 0) {
    throw new Error('Cloudflare GraphQL Analytics returned schema or authorization errors.');
  }
  const accounts = analyticsPayload?.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new Error('Cloudflare GraphQL Analytics did not return exactly one account.');
  }

  const databases = [];
  let page = 1;
  do {
    const url = `${API_BASE_URL}/accounts/${encodeURIComponent(accountId)}/d1/database?page=${String(page)}&per_page=100`;
    const response = await fetchImpl(url, { method: 'GET', headers });
    const payload = await readJson(response, 'Cloudflare D1 inventory');
    if (payload.success !== true || !Array.isArray(payload.result)) {
      throw new Error('Cloudflare D1 inventory returned an invalid response.');
    }
    databases.push(...payload.result);
    const totalPages = requirePositiveInteger(
      payload?.result_info?.total_pages ?? 1,
      'D1 inventory pages',
    );
    page += 1;
    if (page > totalPages) break;
  } while (page <= 100);

  return buildReport(accounts[0], databases);
}

function requireMetric(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} is missing or invalid; refusing to report a false zero.`);
  }
  return value;
}

function requireGroups(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} groups are missing; refusing to report a false zero.`);
  }
  return value;
}

function sumMetrics(groups, select, name) {
  return groups.reduce((total, group) => total + requireMetric(select(group), name), 0);
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} is invalid.`);
  return value;
}

function requireSecret(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be provided through the process environment.`);
  }
}

async function readJson(response, source) {
  if (!response.ok) throw new Error(`${source} failed with HTTP ${String(response.status)}.`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${source} returned invalid JSON.`);
  }
}

function formatMetric(label, metric) {
  const percentage = (metric.ratio * 100).toFixed(2);
  return `${metric.status.padEnd(8)} ${label.padEnd(24)} ${metric.value.toLocaleString('en-US')} / ${metric.limit.toLocaleString('en-US')} (${percentage}%)`;
}

async function main() {
  const report = await readCloudflareFreeUsage({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_ANALYTICS_TOKEN,
  });

  process.stdout.write('Cloudflare Free usage (account-wide, current UTC day)\n');
  process.stdout.write(`${formatMetric('Worker requests', report.workerRequests)}\n`);
  process.stdout.write(`${formatMetric('D1 rows read', report.d1RowsRead)}\n`);
  process.stdout.write(`${formatMetric('D1 rows written', report.d1RowsWritten)}\n`);
  process.stdout.write(`${formatMetric('D1 storage bytes', report.d1Storage)}\n`);
  process.stdout.write(`${formatMetric('D1 databases', report.d1DatabaseCount)}\n`);
  process.stdout.write(
    'Analytics is an operational estimate, not Cloudflare billing authority. No plan change is performed.\n',
  );

  if (Object.values(report).some((metric) => metric.status === 'CRITICAL')) process.exitCode = 2;
  else if (Object.values(report).some((metric) => metric.status === 'WARNING'))
    process.exitCode = 1;
}

const entryPath = process.argv[1];
if (entryPath && fileURLToPath(import.meta.url).toLowerCase() === entryPath.toLowerCase()) {
  main().catch((error) => {
    process.stderr.write(
      `Cloudflare usage check failed closed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 2;
  });
}
