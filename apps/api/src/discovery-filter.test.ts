import { describe, expect, it } from 'vitest';
import {
  effectiveDiscoveryRating,
  resolveDiscoveryGroupSizeFilters,
  resolveDiscoveryLanguageFilters,
  resolveDiscoveryTagFilters,
} from './discovery-routes';

describe('discovery rating tri-state', () => {
  it.each(['SAFE', 'MATURE', 'ALL'] as const)(
    'forces %s to SAFE while Safe Search is enabled',
    (requested) => {
      expect(effectiveDiscoveryRating(requested, true)).toBe('SAFE');
    },
  );

  it.each(['SAFE', 'MATURE', 'ALL'] as const)(
    'preserves explicit %s when Safe Search is disabled',
    (requested) => {
      expect(effectiveDiscoveryRating(requested, false)).toBe(requested);
    },
  );
});

describe('discovery group-size filter', () => {
  it('normalizes and deduplicates every supported group size', () => {
    expect(resolveDiscoveryGroupSizeFilters(' SMALL,single,large,medium,small ')).toEqual([
      'small',
      'single',
      'large',
      'medium',
    ]);
  });

  it('rejects unknown group sizes instead of widening the SQL query', () => {
    expect(() => resolveDiscoveryGroupSizeFilters('single,crowd')).toThrow(
      /Неизвестный размер группы/u,
    );
  });
});

describe('discovery tag tri-state', () => {
  it('normalizes and deduplicates included and excluded tags independently', () => {
    expect(
      resolveDiscoveryTagFilters(' Мистика, slow burn, мистика ', 'Horror, gore', 'romance'),
    ).toEqual({
      include: ['romance', 'мистика', 'slow-burn'],
      exclude: ['horror', 'gore'],
    });
  });

  it('rejects a tag that is simultaneously included and excluded', () => {
    expect(() => resolveDiscoveryTagFilters('slow burn', 'SLOW-BURN')).toThrow(
      /нельзя одновременно включить и исключить/u,
    );
  });
});

describe('discovery language filter', () => {
  it('normalizes, deduplicates and preserves supported Unicode language codes', () => {
    expect(resolveDiscoveryLanguageFilters(' DE,ar,ja,de ', 'ru')).toEqual([
      'ru',
      'de',
      'ar',
      'ja',
    ]);
  });

  it('rejects unknown language codes instead of widening the SQL query', () => {
    expect(() => resolveDiscoveryLanguageFilters('ru,unknown')).toThrow(/Неизвестный язык/u);
  });
});
