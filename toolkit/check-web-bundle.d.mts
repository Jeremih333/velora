export interface ViteManifestRecord {
  readonly file?: string;
  readonly isEntry?: boolean;
  readonly isDynamicEntry?: boolean;
  readonly dynamicImports?: readonly string[];
}

export interface WebBundleReport {
  readonly entryFile: string;
  readonly entryBytes: number;
  readonly chunks: readonly { readonly file: string; readonly bytes: number }[];
  readonly oversizedEntry: boolean;
  readonly oversizedChunks: readonly { readonly file: string; readonly bytes: number }[];
  readonly missingLazyEntries: readonly string[];
}

export const WEB_BUNDLE_LIMITS: Readonly<{
  entryBytes: number;
  chunkBytes: number;
}>;

export function assessWebBundle(
  manifest: Readonly<Record<string, ViteManifestRecord>>,
  fileSizes: Readonly<Record<string, number>>,
): WebBundleReport;

export function checkWebBundle(distDirectory: string): Promise<WebBundleReport>;
