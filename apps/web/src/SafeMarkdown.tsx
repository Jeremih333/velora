import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

export function SafeMarkdown({
  content,
  streaming = false,
}: {
  readonly content: string;
  readonly streaming?: boolean;
}) {
  return (
    <div className={`safe-markdown${streaming ? ' is-streaming' : ''}`}>
      <ReactMarkdown
        skipHtml
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
