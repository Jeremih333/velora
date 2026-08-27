import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const safeProtocols = new Set(['http:', 'https:', 'mailto:']);

export function safeMarkdownUrlTransform(url: string): string {
  const normalized = url.trim();
  const protocol = /^[a-z][a-z\d+.-]*:/iu.exec(normalized)?.[0]?.toLowerCase();
  if (!protocol || safeProtocols.has(protocol)) return normalized;
  return '';
}

export function stabilizeStreamingMarkdown(content: string): string {
  const missing: string[] = [];
  const openDelimiters: string[] = [];
  let fenced = false;
  let inlineCode = false;
  let linkDestination = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (content.startsWith('```', index)) {
      fenced = !fenced;
      index += 2;
      continue;
    }
    if (fenced) continue;
    if (character === '`') {
      inlineCode = !inlineCode;
      continue;
    }
    if (inlineCode) continue;
    if (content.startsWith('](', index)) {
      linkDestination = true;
      index += 1;
      continue;
    }
    if (linkDestination && character === ')') {
      linkDestination = false;
      continue;
    }
    if (character !== '*' && character !== '~') continue;
    let runLength = 1;
    while (content[index + runLength] === character && runLength < 3) runLength += 1;
    if (character === '~' && runLength < 2) continue;
    const delimiter = character.repeat(character === '~' ? 2 : runLength);
    if (openDelimiters.at(-1) === delimiter) openDelimiters.pop();
    else openDelimiters.push(delimiter);
    index += delimiter.length - 1;
  }

  if (linkDestination) missing.push(')');
  for (const delimiter of openDelimiters.reverse()) missing.push(delimiter);
  if (inlineCode) missing.push('`');
  if (fenced) missing.push('\n```');
  return `${content}${missing.join('')}`;
}

export function SafeMarkdown({
  content,
  streaming = false,
}: {
  readonly content: string;
  readonly streaming?: boolean;
}) {
  const renderedContent = streaming ? stabilizeStreamingMarkdown(content) : content;
  return (
    <div className={`safe-markdown${streaming ? ' is-streaming' : ''}`}>
      <ReactMarkdown
        skipHtml
        urlTransform={safeMarkdownUrlTransform}
        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ children, ...properties }) => (
            <a {...properties} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  );
}
