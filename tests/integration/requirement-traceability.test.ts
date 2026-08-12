import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('master-brief requirement traceability', () => {
  it('contains exactly one auditable row for every numbered section 0 through 178', async () => {
    const source = await readFile(
      new URL('../../docs/testing/REQUIREMENT_TRACEABILITY.md', import.meta.url),
      'utf8',
    );
    const sectionNumbers = [...source.matchAll(/^\|\s*(\d+)\s*\|/gmu)].map((match) =>
      Number(match[1]),
    );

    expect(sectionNumbers).toEqual(Array.from({ length: 179 }, (_, index) => index));
  });

  it('does not call the remaining production checkpoints complete', async () => {
    const source = await readFile(
      new URL('../../docs/testing/REQUIREMENT_TRACEABILITY.md', import.meta.url),
      'utf8',
    );

    expect(source).toContain('| 45  | Telegram Stars');
    expect(source).toContain('| 130 | Telegram bootstrap');
    expect(source).toContain('| 132 | Production smoke');
    expect(source).toContain('| 137 | Global Definition of Done');
    expect(source).toContain('BLOCKED_HUMAN');
    expect(source).toContain('PARTIAL');
    expect(source).not.toContain('| 137 | Global Definition of Done                | VERIFIED ');
  });
});
