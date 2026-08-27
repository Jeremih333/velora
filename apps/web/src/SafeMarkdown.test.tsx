import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown, safeMarkdownUrlTransform, stabilizeStreamingMarkdown } from './SafeMarkdown';

describe('SafeMarkdown', () => {
  it('renders the supported roleplay markdown subset', () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown
        content={
          '*Действие* и **слово** и ***очень важно***\n\n> цитата\n\n- пункт\n\n~~исправлено~~\n\n`код`\n\n```ts\nconst safe = true;\n```\n\n[ссылка](https://example.com)'
        }
      />,
    );
    expect(html).toContain('<em>Действие</em>');
    expect(html).toContain('<strong>слово</strong>');
    expect(html).toContain('<em><strong>очень важно</strong></em>');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<del>исправлено</del>');
    expect(html).toContain('<code>код</code>');
    expect(html).toContain('<pre><code class="language-ts">');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('drops raw HTML and unsafe javascript links', () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown
        content={
          '<script>alert(1)</script>\n<iframe src="https://evil.test"></iframe>\n<img src=x onerror="alert(2)">\n<button onclick="alert(3)">x</button>\n\n[опасно](javascript:alert(4))'
        }
      />,
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('alert(');
    expect(html).toContain('опасно');
  });

  it('allows only relative, web, and mail links', () => {
    expect(safeMarkdownUrlTransform('/character/1')).toBe('/character/1');
    expect(safeMarkdownUrlTransform('#scene')).toBe('#scene');
    expect(safeMarkdownUrlTransform('https://example.com')).toBe('https://example.com');
    expect(safeMarkdownUrlTransform('mailto:author@example.com')).toBe('mailto:author@example.com');
    expect(safeMarkdownUrlTransform('javascript:alert(1)')).toBe('');
    expect(safeMarkdownUrlTransform('data:text/html,boom')).toBe('');
    expect(safeMarkdownUrlTransform('vbscript:msgbox(1)')).toBe('');
  });

  it.each([
    ['single emphasis', '*Он медленно подошёл', '*Он медленно подошёл*'],
    ['strong emphasis', '**Имя', '**Имя**'],
    ['partial link', '[архив](https://example.com', '[архив](https://example.com)'],
    ['inline code', '`echo hello', '`echo hello`'],
    ['code fence', '```ts\nconst x = 1', '```ts\nconst x = 1\n```'],
    ['multiline list', '- первый\n- второй', '- первый\n- второй'],
  ])('stabilizes streaming %s without mutating the persisted content', (_, partial, expected) => {
    expect(stabilizeStreamingMarkdown(partial)).toBe(expected);
    expect(renderToStaticMarkup(<SafeMarkdown content={partial} streaming />)).not.toContain(
      'javascript:',
    );
  });
});
