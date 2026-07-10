/** Supported OCR input MIME types (aligned with document upload constraints). */
export const MISTRAL_OCR_SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
] as const;

export type MistralOcrSupportedMimeType = (typeof MISTRAL_OCR_SUPPORTED_MIME_TYPES)[number];

export interface MistralOcrInput {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
  /** Zero-based page indexes forwarded to the Mistral OCR API. */
  pageIndexes?: number[];
  /** Correlation id for server logs only — never sent as document content. */
  extractionId?: string;
}

export interface MistralOcrPageTable {
  id: string;
  format: 'markdown' | 'html';
  content: string;
}

export interface MistralOcrPage {
  pageIndex: number;
  pageNumber: number;
  markdown: string;
  header?: string | null;
  footer?: string | null;
  tables?: MistralOcrPageTable[];
}

export interface MistralOcrUsageMetadata {
  pagesProcessed: number;
  docSizeBytes?: number | null;
}

export interface MistralOcrOutput {
  fullText: string;
  normalizedMarkdown: string;
  pages: MistralOcrPage[];
  pageCount: number;
  provider: 'mistral';
  model: string;
  processingDurationMs: number;
  usage?: MistralOcrUsageMetadata;
}
