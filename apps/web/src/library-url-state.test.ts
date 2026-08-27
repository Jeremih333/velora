import { describe, expect, it } from 'vitest';
import { parseLibraryUrlState, writeLibraryUrlState } from './library-url-state';

describe('library URL state', () => {
  it('parses valid controls and rejects unsupported values', () => {
    expect(parseLibraryUrlState('?q=alice&sort=oldest&visibility=PRIVATE&kind=small')).toEqual({
      query: 'alice',
      sort: 'oldest',
      visibility: 'PRIVATE',
      kind: 'small',
    });
    expect(parseLibraryUrlState('?sort=random&visibility=broken&kind=huge')).toEqual({
      query: '',
      sort: 'newest',
      visibility: 'ALL',
      kind: 'ALL',
    });
  });

  it('preserves launch parameters while removing default controls', () => {
    expect(
      writeLibraryUrlState('?tgWebAppStartParam=character_1&sort=oldest', {
        query: '',
        sort: 'newest',
        visibility: 'ALL',
        kind: 'ALL',
      }),
    ).toBe('?tgWebAppStartParam=character_1');
  });
});
