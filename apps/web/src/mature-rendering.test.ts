import { describe, expect, it } from 'vitest';
import { storyCoverClassName } from './AuthenticatedApp';

describe('Mature cover rendering', () => {
  it('applies a real blur class only to Mature imagery when the preference is enabled', () => {
    expect(storyCoverClassName('MATURE', true)).toContain('is-mature-blurred');
    expect(storyCoverClassName('MATURE', false)).toBe('story-cover');
    expect(storyCoverClassName('SAFE', true)).toBe('story-cover');
  });
});
