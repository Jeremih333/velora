import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('character image layout contract', () => {
  it('makes the preview trigger fill the complete hero instead of letterboxing it', async () => {
    const css = await readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\.story-cover\s*>\s*\.avatar-preview-trigger\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;/su,
    );
    expect(css).toMatch(
      /\.story-cover img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/su,
    );
  });

  it('keeps compact character metadata and action labels on one line', async () => {
    const css = await readFile(new URL('../../apps/web/src/styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\.story-card:not\(\.is-expanded\) \.creator-link\s*\{[^}]*display:\s*inline-flex;[^}]*white-space:\s*nowrap;/su,
    );
    expect(css).toMatch(
      /\.story-card:not\(\.is-expanded\) \.creator-link > span:first-child\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/su,
    );
    expect(css).toMatch(
      /\.story-card:not\(\.is-expanded\) \.character-interactions button\s*\{[^}]*min-height:\s*42px;[^}]*white-space:\s*nowrap;/su,
    );
  });
});
