import { describe, expect, it } from 'vitest';
import { appealInputSchema, moderationActionSchema, reportInputSchema } from './index';

describe('moderation contracts', () => {
  it('normalizes a valid report without accepting unknown taxonomy values', () => {
    const report = reportInputSchema.parse({
      targetType: 'CHARACTER',
      targetId: crypto.randomUUID(),
      reason: 'SPAM',
    });
    expect(report.description).toBe('');
    expect(() => reportInputSchema.parse({ ...report, reason: 'MADE_UP' })).toThrow();
  });

  it('requires meaningful reasons and appeal statements', () => {
    expect(() => moderationActionSchema.parse({ action: 'WARNING', reason: 'no' })).toThrow();
    expect(() =>
      appealInputSchema.parse({ caseId: crypto.randomUUID(), statement: 'слишком коротко' }),
    ).toThrow();
  });
});
