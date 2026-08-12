import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_SAMPLES = 12;
const MAX_SAMPLES = 30;
const REQUEST_TIMEOUT_MS = 5_000;

const probes = Object.freeze([
  {
    name: 'health',
    path: '/health',
    validate: (payload) => payload?.status === 'ok',
  },
  {
    name: 'ready',
    path: '/ready',
    validate: (payload) => payload?.status === 'ready' && payload?.dependencies?.d1 === true,
  },
  {
    name: 'publicConfig',
    path: '/api/v1/config',
    validate: (payload, environment) =>
      payload?.appName === 'Velora' && payload?.environment === environment,
  },
  {
    name: 'openApi',
    path: '/openapi.json',
    validate: (payload) => payload?.openapi === '3.1.0' && countObjectKeys(payload?.paths) >= 100,
  },
]);

export function validateTarget(baseUrl, environment) {
  if (!['local', 'staging'].includes(environment)) {
    throw new Error('SLO baseline accepts only local or staging; production is forbidden.');
  }
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('SLO baseline URL is invalid.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('SLO baseline URL must not contain credentials, query or fragment.');
  }
  parsed.pathname = '/';
  if (environment === 'local') {
    if (
      parsed.protocol !== 'http:' ||
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      !parsed.port
    ) {
      throw new Error('Local baseline is restricted to an explicit localhost HTTP port.');
    }
  } else if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'velora-staging.carreljeremih.workers.dev' ||
    parsed.port
  ) {
    throw new Error('Staging baseline is restricted to the isolated Velora staging Worker.');
  }
  return parsed.toString().replace(/\/$/u, '');
}

export function percentile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0 || !values.every(Number.isFinite)) {
    throw new Error('Latency percentile requires a non-empty finite sample.');
  }
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error('Percentile ratio must be between zero and one.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(ratio * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export async function measureSloBaseline({
  baseUrl,
  environment,
  samples = DEFAULT_SAMPLES,
  fetchImpl = fetch,
  now = () => performance.now(),
}) {
  const normalizedBaseUrl = validateTarget(baseUrl, environment);
  if (!Number.isInteger(samples) || samples < 3 || samples > MAX_SAMPLES) {
    throw new Error(`Samples must be an integer between 3 and ${String(MAX_SAMPLES)}.`);
  }
  const results = {};
  for (const probe of probes) {
    const latencies = [];
    const failures = [];
    for (let sample = 0; sample < samples; sample += 1) {
      const startedAt = now();
      let response;
      try {
        response = await fetchImpl(`${normalizedBaseUrl}${probe.path}`, {
          method: 'GET',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        failures.push({ sample, category: error instanceof Error ? error.name : 'NETWORK_ERROR' });
        continue;
      }
      let payload;
      try {
        payload = await response.json();
      } catch {
        failures.push({ sample, category: 'INVALID_JSON', status: response.status });
        continue;
      }
      if (!response.ok || !probe.validate(payload, environment)) {
        failures.push({ sample, category: 'INVALID_RESPONSE', status: response.status });
        continue;
      }
      latencies.push(Math.max(0, now() - startedAt));
    }
    results[probe.name] = summarize(latencies, failures, samples);
  }
  return {
    schemaVersion: 1,
    environment,
    baseUrl: normalizedBaseUrl,
    samplesPerProbe: samples,
    totalRequests: samples * probes.length,
    measuredAt: new Date().toISOString(),
    probes: results,
  };
}

function summarize(latencies, failures, requested) {
  return {
    requested,
    succeeded: latencies.length,
    failed: failures.length,
    availabilityRatio: latencies.length / requested,
    p50Ms: latencies.length > 0 ? round(percentile(latencies, 0.5)) : null,
    p95Ms: latencies.length > 0 ? round(percentile(latencies, 0.95)) : null,
    maxMs: latencies.length > 0 ? round(Math.max(...latencies)) : null,
    failures,
  };
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function countObjectKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

function parseArguments(argumentsList) {
  const normalizedArguments = argumentsList.filter((argument) => argument !== '--');
  const values = new Map();
  for (let index = 0; index < normalizedArguments.length; index += 2) {
    const key = normalizedArguments[index];
    const value = normalizedArguments[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('Invalid CLI arguments.');
    values.set(key.slice(2), value);
  }
  const environment = values.get('environment');
  const baseUrl = values.get('base-url');
  if (!environment || !baseUrl) {
    throw new Error(
      'Usage: node toolkit/slo-baseline.mjs --environment <local|staging> --base-url <url> [--samples <3-30>]',
    );
  }
  const rawSamples = values.get('samples');
  return {
    environment,
    baseUrl,
    samples: rawSamples === undefined ? DEFAULT_SAMPLES : Number(rawSamples),
  };
}

async function main() {
  const report = await measureSloBaseline(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (Object.values(report.probes).some((probe) => probe.failed > 0)) process.exitCode = 2;
}

const entryPath = process.argv[1];
if (entryPath && fileURLToPath(import.meta.url).toLowerCase() === entryPath.toLowerCase()) {
  main().catch((error) => {
    process.stderr.write(
      `SLO baseline failed closed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    process.exitCode = 2;
  });
}
