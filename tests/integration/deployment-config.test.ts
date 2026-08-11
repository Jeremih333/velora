import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

function requireRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

describe('deployment paid-feature boundaries', () => {
  it('enables paid roleplay only in staging while payments stay disabled everywhere', async () => {
    const source = await readFile(
      new URL('../../apps/api/wrangler.jsonc', import.meta.url),
      'utf8',
    );
    const parsed: unknown = JSON.parse(source.replace(/,\s*([}\]])/gu, '$1'));
    const config = requireRecord(parsed, 'wrangler config');
    const production = requireRecord(config['vars'], 'production vars');
    const environments = requireRecord(config['env'], 'environments');
    const staging = requireRecord(environments['staging'], 'staging environment');
    const stagingVars = requireRecord(staging['vars'], 'staging vars');
    const local = requireRecord(environments['local'], 'local environment');
    const localVars = requireRecord(local['vars'], 'local vars');

    expect(production['PAID_AI_ENABLED']).toBe('false');
    expect(stagingVars['PAID_AI_ENABLED']).toBe('true');
    expect(localVars['PAID_AI_ENABLED']).toBe('false');
    expect(production['PAYMENTS_ENABLED']).toBe('false');
    expect(stagingVars['PAYMENTS_ENABLED']).toBe('false');
    expect(localVars['PAYMENTS_ENABLED']).toBe('false');
  });
});
