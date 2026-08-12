export interface DocumentationLinkFinding {
  readonly source: string;
  readonly target: string;
  readonly reason: 'MISSING' | 'OUTSIDE_PROJECT' | 'INVALID_ENCODING';
}

export function extractLocalMarkdownTargets(source: string): readonly string[];
export function checkDocumentationLinks(
  projectRoot: string,
): Promise<readonly DocumentationLinkFinding[]>;
