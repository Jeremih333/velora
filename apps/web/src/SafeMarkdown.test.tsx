import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown } from './SafeMarkdown';

describe('SafeMarkdown', () => {
  it('renders the supported roleplay markdown subset', () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown
        content={'*Действие* и **слово**\n\n> цитата\n\n- пункт\n\n~~исправлено~~\n\n`код`'}
      />,
    );
    expect(html).toContain('<em>Действие</em>');
    expect(html).toContain('<strong>слово</strong>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<del>исправлено</del>');
    expect(html).toContain('<code>код</code>');
  });

  it('drops raw HTML and unsafe javascript links', () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown content={'<script>alert(1)</script>\n\n[опасно](javascript:alert(1))'} />,
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('опасно');
  });
});
