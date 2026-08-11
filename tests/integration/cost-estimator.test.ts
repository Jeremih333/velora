import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const estimatorPath = fileURLToPath(new URL('../../toolkit/cost-estimator.mjs', import.meta.url));

describe('annual BotHub cost estimator', () => {
  it('includes the fixed one-ruble API request charge in every generated reply', () => {
    const output = execFileSync(process.execPath, [estimatorPath, '100', '8000', '600'], {
      encoding: 'utf8',
    });

    expect(output).toContain('balanced: expected 1.254 RUB/reply and 45766 RUB/year');
    expect(output).toContain('expected with 15% reserve 52631 RUB, 10 Elite pack(s) = 55000 RUB');
    expect(output).toContain(
      'balanced retry/fallback chain: ceiling 3.693 RUB/reply, 155029 RUB/year, 29 Elite pack(s) = 159500 RUB',
    );
  });
});
