import { describe, expect, it } from 'vitest';
import { parseDiscoveryUrlState, writeDiscoveryUrlState } from './discovery-url-state';

describe('discovery URL state', () => {
  it('restores all supported search controls and rejects invalid enum values', () => {
    expect(
      parseDiscoveryUrlState(
        '?q=space%20opera&sort=oldest&languages=ru,en,bad&groupSizes=single,large,nope&rating=MATURE&includeTags=space,slow-burn&excludeTags=horror',
      ),
    ).toEqual({
      query: 'space opera',
      sort: 'oldest',
      filters: {
        languages: ['ru', 'en'],
        groupSizes: ['single', 'large'],
        rating: 'MATURE',
        includeTags: ['space', 'slow-burn'],
        excludeTags: ['horror'],
      },
    });
  });

  it('updates discovery parameters while preserving Telegram and deep-link parameters', () => {
    const search = writeDiscoveryUrlState('?character=char-1&tgWebAppStartParam=keep', {
      query: 'hero',
      sort: 'newest',
      filters: {
        languages: ['en'],
        groupSizes: [],
        rating: 'SAFE',
        includeTags: ['fantasy'],
        excludeTags: [],
      },
    });
    const parameters = new URLSearchParams(search);

    expect(parameters.get('character')).toBe('char-1');
    expect(parameters.get('tgWebAppStartParam')).toBe('keep');
    expect(parameters.get('q')).toBe('hero');
    expect(parameters.get('sort')).toBeNull();
    expect(parameters.get('languages')).toBe('en');
    expect(parameters.get('rating')).toBe('SAFE');
    expect(parameters.get('includeTags')).toBe('fantasy');
  });

  it('removes defaults and empty filters from the URL', () => {
    expect(
      writeDiscoveryUrlState('?q=old&sort=oldest&languages=ru&rating=MATURE', {
        query: '',
        sort: 'newest',
        filters: {
          languages: [],
          groupSizes: [],
          rating: 'ALL',
          includeTags: [],
          excludeTags: [],
        },
      }),
    ).toBe('');
  });
});
