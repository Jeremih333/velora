import {
  characterGroupSizes,
  characterLanguages,
  type CharacterGroupSize,
  type CharacterLanguageCode,
} from '@velora/shared';
import type { DiscoveryFilters } from './ProductComponents';

export type DiscoverySort = 'newest' | 'oldest';

export interface DiscoveryUrlState {
  readonly query: string;
  readonly sort: DiscoverySort;
  readonly filters: DiscoveryFilters;
}

const languageCodes = new Set(characterLanguages.map(({ code }) => code));
const groupSizeCodes = new Set(characterGroupSizes.map(({ code }) => code));

function commaValues(value: string | null): readonly string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function parseDiscoveryUrlState(search: string): DiscoveryUrlState {
  const parameters = new URLSearchParams(search);
  const languages = commaValues(parameters.get('languages')).filter((value) =>
    languageCodes.has(value as CharacterLanguageCode),
  ) as readonly CharacterLanguageCode[];
  const groupSizes = commaValues(parameters.get('groupSizes')).filter((value) =>
    groupSizeCodes.has(value as CharacterGroupSize),
  ) as readonly CharacterGroupSize[];
  const ratingParameter = parameters.get('rating');
  const sortParameter = parameters.get('sort');

  return {
    query: parameters.get('q')?.trim() ?? '',
    sort: sortParameter === 'oldest' ? 'oldest' : 'newest',
    filters: {
      languages,
      groupSizes,
      rating: ratingParameter === 'SAFE' || ratingParameter === 'MATURE' ? ratingParameter : 'ALL',
      includeTags: commaValues(parameters.get('includeTags')),
      excludeTags: commaValues(parameters.get('excludeTags')),
    },
  };
}

export function writeDiscoveryUrlState(search: string, state: DiscoveryUrlState): string {
  const parameters = new URLSearchParams(search);
  const setList = (name: string, values: readonly string[]) => {
    if (values.length === 0) parameters.delete(name);
    else parameters.set(name, values.join(','));
  };

  if (state.query) parameters.set('q', state.query);
  else parameters.delete('q');
  if (state.sort === 'oldest') parameters.set('sort', state.sort);
  else parameters.delete('sort');
  setList('languages', state.filters.languages);
  setList('groupSizes', state.filters.groupSizes);
  if (state.filters.rating === 'ALL') parameters.delete('rating');
  else parameters.set('rating', state.filters.rating);
  setList('includeTags', state.filters.includeTags);
  setList('excludeTags', state.filters.excludeTags);

  const value = parameters.toString();
  return value ? `?${value}` : '';
}
