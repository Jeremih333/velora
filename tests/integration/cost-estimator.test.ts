import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const estimatorPath = fileURLToPath(new URL('../../toolkit/cost-estimator.mjs', import.meta.url));

describe('annual BotHub cost estimator', () => {
  it('converts the documented USD request surcharge with an explicit conservative rate', () => {
    const output = execFileSync(process.execPath, [estimatorPath, '100', '8000', '600', '100'], {
      encoding: 'utf8',
    });

    expect(output).toContain('0.01 USD/request at 100.00 RUB/USD = 1.00 RUB/request');
    expect(output).toContain('Elite 35,000,000 CAPS / 5500 RUB');
    expect(output).toContain('balanced: expected 1.254 RUB/reply and 45766 RUB/year');
    expect(output).toContain('expected with 15% reserve 52631 RUB, 10 Elite pack(s) = 55000 RUB');
    expect(output).toContain(
      'balanced retry/fallback chain: ceiling 3.693 RUB/reply, 155029 RUB/year, 29 Elite pack(s) = 159500 RUB',
    );
  });

  it('changes the annual envelope when the owner selects another USD/RUB reserve', () => {
    const output = execFileSync(process.execPath, [estimatorPath, '100', '8000', '600', '120'], {
      encoding: 'utf8',
    });

    expect(output).toContain('0.01 USD/request at 120.00 RUB/USD = 1.20 RUB/request');
    expect(output).toContain('balanced: expected 1.454 RUB/reply and 53066 RUB/year');
  });
});
