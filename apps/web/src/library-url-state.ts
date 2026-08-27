import type { CharacterGroupSize } from '@velora/shared';

export type LibrarySort = 'newest' | 'oldest';
export type CharacterVisibility = 'ALL' | 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
export type CharacterKind = 'ALL' | CharacterGroupSize;

export interface LibraryUrlState {
  readonly query: string;
  readonly sort: LibrarySort;
  readonly visibility: CharacterVisibility;
  readonly kind: CharacterKind;
}

const visibilities = new Set<CharacterVisibility>(['ALL', 'PUBLIC', 'UNLISTED', 'PRIVATE']);
const kinds = new Set<CharacterKind>(['ALL', 'single', 'small', 'medium', 'large']);

export function parseLibraryUrlState(search: string): LibraryUrlState {
  const parameters = new URLSearchParams(search);
  const visibility = parameters.get('visibility')?.toUpperCase() ?? 'ALL';
  const kind = parameters.get('kind') ?? 'ALL';
  return {
    query: parameters.get('q')?.trim().slice(0, 80) ?? '',
    sort: parameters.get('sort') === 'oldest' ? 'oldest' : 'newest',
    visibility: visibilities.has(visibility as CharacterVisibility)
      ? (visibility as CharacterVisibility)
      : 'ALL',
    kind: kinds.has(kind as CharacterKind) ? (kind as CharacterKind) : 'ALL',
  };
}

export function writeLibraryUrlState(search: string, state: LibraryUrlState): string {
  const parameters = new URLSearchParams(search);
  setOptional(parameters, 'q', state.query.trim());
  setOptional(parameters, 'sort', state.sort === 'oldest' ? state.sort : '');
  setOptional(parameters, 'visibility', state.visibility === 'ALL' ? '' : state.visibility);
  setOptional(parameters, 'kind', state.kind === 'ALL' ? '' : state.kind);
  const serialized = parameters.toString();
  return serialized ? `?${serialized}` : '';
}

function setOptional(parameters: URLSearchParams, key: string, value: string): void {
  if (value) parameters.set(key, value);
  else parameters.delete(key);
}
